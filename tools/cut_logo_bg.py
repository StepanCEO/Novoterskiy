"""Вырезает однотонный фон у логотипов-треугольников и пишет webp с альфой.

Простой color-key тут не работает: у огненного знака тёмная сердцевина того же
цвета, что фон, а у воздушного — белые буквы «КМВ». Поэтому маска строится по
форме (крупные связные компоненты + заливка внутренних дыр), а мягкий край
берётся из яркости только в узкой полосе вокруг формы — так пропадают искры и
не остаётся тёмной/белой каймы.

Запуск: python tools/cut_logo_bg.py
"""

import numpy as np
from PIL import Image
from scipy import ndimage

OUT_MAX = 512          # иконка живёт в блоке 76x58 — 512px хватает и для 3x DPI
PAD = 6                # поля вокруг вырезанной формы, px исходника
MIN_PART = 0.0004      # компонент меньше 0.04% площади считаем шумом/искрой
FEATHER = 18           # ширина полосы мягкого края вокруг формы, px исходника

JOBS = [
    # (файл, цвет фона, порог формы, порог мягкого края)
    # У огня порог выше: вокруг знака рассыпаны тусклые тёмно-красные искры,
    # на светлой странице они читались бы как грязь по контуру.
    ("assets/kmv-fire.png", (0, 0, 0), 60, 34),
    ("assets/kmv-air.png", (255, 255, 255), 16, 6),
    ("assets/kmv-ice.png", (255, 255, 255), 16, 6),
]


def cut(path, bg, shape_threshold, edge_threshold):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    # Насколько пиксель отличается от фона — по самому «громкому» каналу.
    diff = np.abs(rgb - np.array(bg, dtype=np.float32)).max(axis=2)

    # 1. Форма: крупные связные компоненты, дыры внутри залиты.
    labels, count = ndimage.label(diff > shape_threshold)
    keep = np.zeros(count + 1, dtype=bool)
    sizes = ndimage.sum(np.ones_like(labels), labels, range(1, count + 1))
    keep[1:] = sizes >= MIN_PART * diff.size
    shape = ndimage.binary_fill_holes(keep[labels])

    # 2. Мягкий край: яркость, но только рядом с формой, чтобы искры вне знака
    #    не превратились в отдельные точки с ореолом.
    near = ndimage.binary_dilation(shape, iterations=FEATHER)
    soft = np.clip((diff - edge_threshold) / max(shape_threshold - edge_threshold, 1), 0, 1)
    alpha = np.where(shape, 1.0, soft * near)

    # 3. Снимаем подмешанный фон с полупрозрачных пикселей: иначе на светлой
    #    странице у огня останется тёмная кайма, а у льда — белёсая.
    a = alpha[..., None]
    safe = np.maximum(a, 1e-3)
    edge = (~shape)[..., None] & (a > 0)
    unmixed = (rgb - np.array(bg, dtype=np.float32) * (1 - a)) / safe
    out_rgb = np.where(edge, np.clip(unmixed, 0, 255), rgb)

    out = np.dstack([out_rgb, alpha * 255]).round().clip(0, 255).astype(np.uint8)
    image = Image.fromarray(out, "RGBA")

    # 4. Обрезаем пустоту и уменьшаем до разумного размера.
    box = image.getbbox()
    if box:
        left, top, right, bottom = box
        image = image.crop((max(left - PAD, 0), max(top - PAD, 0),
                            min(right + PAD, image.width), min(bottom + PAD, image.height)))
    if max(image.size) > OUT_MAX:
        scale = OUT_MAX / max(image.size)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)

    target = path.rsplit(".", 1)[0] + ".webp"
    image.save(target, "WEBP", quality=90, method=6, exact=True)
    return target, image.size


if __name__ == "__main__":
    for path, bg, shape_threshold, edge_threshold in JOBS:
        target, size = cut(path, bg, shape_threshold, edge_threshold)
        print(target, size)
