"""Вырезает чёрный фон у присланных кадров бутылок и пишет webp+avif с альфой.

Отличие от cut_product_bg.py: там студийная циклорама — светлая, с градиентом и
мягкой тенью, и фон приходится моделировать полиномом. Здесь заказчик присылает
кадр, уже отделённый чужим инструментом и положенный на чистый чёрный (0,0,0).
Такой кадр — по сути premultiplied alpha: яркость пикселя уже умножена на долю
покрытия, поэтому край восстанавливается делением, а не размытием маски.

Порядок: силуэт по max-каналу (цветная крышка не теряется, в отличие от
среднего), заливка дыр, отсев мусора; альфа на кромке берётся из самой яркости,
внутри силуэта прижимается к единице; цвет делится на альфу — это снимает
чёрную кайму, которая иначе висит по контуру на светлом фоне каталога.

Тон приводится к уже лежащим карточкам: у соседей по каталогу медиана корпуса
около 200, 90-й перцентиль около 215. Без этого шага новая бутылка выходит
заметно светлее ряда и выбивается из сетки. Кадрам, где почти вся бутылка —
прозрачный корпус, этот шаг вредит, и в JOBS он выключается (см. комментарий
к списку).

    python tools/cut_black_bg.py
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

OUT_DIR = "assets/products"
OUT_HEIGHT = 815      # высота карточки, как у остальных бутылок в каталоге
PAD = 6               # поля вокруг силуэта, px исходника

CORE_LEVEL = 40       # яркость, ниже которой пиксель — заведомо фон
MIN_PART = 0.0015     # компонент меньше 0.15% кадра — пыль или блик
EDGE_FULL = 120       # яркость, с которой пиксель считается полностью непрозрачным

# Целевой тон: медиана и 90-й перцентиль корпуса у соседних карточек каталога.
# Меряно по celebnaya-pet-*/pityevaya-pet-* — p50 около 200, p90 около 215.
TONE_P50 = 202
TONE_P90 = 216

DOWNLOADS = os.path.expanduser("~/Downloads")

# (исходник, имя в assets/products, приводить ли тон к соседям)
#
# Тон приводится не всегда. У питьевой 0,5 л корпус прозрачный почти целиком, и
# разброс яркости внутри бутылки — это и есть вода: рёбра, стенки, линия налива.
# Кривая match_tone сжимает разброс с 146 уровней до 82, и вместо воды остаётся
# ровная светлая масса — бутылка выглядит мутной. Пусть она будет контрастнее
# ряда: в витрине каталога в фокусе всё равно одна позиция.
JOBS = [
    (f"{DOWNLOADS}/1.5 газированная питьевая.png", "pityevaya-pet-15-gas", True),
    (f"{DOWNLOADS}/0.5 питьевая негазированная.png", "pityevaya-pet-05", False),
]


def silhouette(lum):
    """Форма предмета: крупные связные компоненты выше порога, дыры залиты."""
    core = lum > CORE_LEVEL
    core = ndimage.binary_closing(core, np.ones((5, 5)))

    lab, n = ndimage.label(core)
    if n:
        sizes = ndimage.sum(core, lab, range(1, n + 1))
        keep = np.arange(1, n + 1)[sizes > core.size * MIN_PART]
        core = np.isin(lab, keep)

    return ndimage.binary_fill_holes(core)


def build_alpha(lum, shape):
    """Альфа: внутри формы — единица, на кромке — доля покрытия из яркости.

    Кадр лежит на чёрном, значит на полупрозрачном крае яркость уже умножена
    на покрытие. Берём её как альфу и нормируем: с EDGE_FULL и выше — плотно.
    """
    edge = np.clip(lum / EDGE_FULL, 0.0, 1.0)

    # Внутренность формы — без кромки: там альфа должна быть ровно 1, иначе
    # тёмные участки этикетки станут полупрозрачными и фон каталога просвечит.
    inner = ndimage.binary_erosion(shape, np.ones((3, 3)), iterations=3)

    alpha = np.where(inner, 1.0, edge)
    alpha = np.where(shape, alpha, 0.0)
    return np.clip(alpha, 0.0, 1.0)


def unpremultiply(rgb, alpha):
    """Снимает домножение на альфу — иначе по контуру остаётся чёрная кайма."""
    a = np.clip(alpha, 1e-3, 1.0)[..., None]
    return np.clip(rgb / a, 0, 255)


def match_tone(rgb, alpha):
    """Тянет яркость корпуса к тону соседних карточек, не трогая цветность.

    Кривая считается по яркости и применяется как коэффициент к каналам:
    отношение R:G:B сохраняется, меняется только светлота. Прибавлять смещение
    ко всем каналам разом нельзя — оно поднимает тёмный канал сильнее светлого,
    и насыщенные места выцветают: красная крышка уходит в лососевый, а бирюза
    этикетки — в блёклый серо-голубой.
    """
    solid = alpha > 0.9
    if solid.sum() < 100:
        return rgb

    lum = rgb.mean(axis=2)
    p50, p90 = np.percentile(lum[solid], 50), np.percentile(lum[solid], 90)
    if p90 - p50 < 1:
        return rgb

    gain = (TONE_P90 - TONE_P50) / (p90 - p50)
    bias = TONE_P50 - p50 * gain

    src = np.maximum(lum, 1.0)
    dst = np.clip(src * gain + bias, 0, 255)
    return np.clip(rgb * (dst / src)[..., None], 0, 255)


def process(src, name, tone=True):
    rgb = np.array(Image.open(src).convert("RGB")).astype(float)
    lum = rgb.max(axis=2)   # max-канал: цветная крышка не проваливается

    shape = silhouette(lum)
    alpha = build_alpha(lum, shape)

    rgb = unpremultiply(rgb, alpha)
    if tone:
        rgb = match_tone(rgb, alpha)

    ys, xs = np.where(shape)
    y0 = max(ys.min() - PAD, 0)
    y1 = min(ys.max() + PAD + 1, shape.shape[0])
    x0 = max(xs.min() - PAD, 0)
    x1 = min(xs.max() + PAD + 1, shape.shape[1])

    rgba = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255])
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA")

    w = max(round(im.width * OUT_HEIGHT / im.height), 1)
    im = im.resize((w, OUT_HEIGHT), Image.LANCZOS)

    webp = os.path.join(OUT_DIR, f"{name}.webp")
    avif = os.path.join(OUT_DIR, f"{name}.avif")
    im.save(webp, quality=92, method=6)
    im.save(avif, quality=80)

    solid = np.array(im).astype(float)
    m = solid[..., 3] > 200
    body = solid[..., :3].mean(axis=2)[m]
    print(
        f"{name}: {im.width}x{im.height}  "
        f"p50={np.percentile(body, 50):.0f} p90={np.percentile(body, 90):.0f}"
    )


if __name__ == "__main__":
    for src, name, tone in JOBS:
        process(src, name, tone)
