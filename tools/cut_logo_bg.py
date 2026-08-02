"""Вырезает однотонный фон у логотипов-треугольников и пишет webp с альфой.

Простой color-key тут не работает: у воздушного знака белые буквы «КМВ» того же
цвета, что фон. Поэтому маска строится по форме (крупные связные компоненты +
заливка внутренних дыр), а мягкий край берётся из яркости только в узкой полосе
вокруг формы — так пропадают искры и не остаётся тёмной/белой каймы.

Огненный знак идёт отдельным путём (cut_glow) — см. комментарий у функции.

Запуск: python tools/cut_logo_bg.py
"""

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

OUT_MAX = 512          # иконка живёт в блоке 76x58 — 512px хватает и для 3x DPI
PAD = 6                # поля вокруг вырезанной формы, px исходника
MIN_PART = 0.0004      # компонент меньше 0.04% площади считаем шумом/искрой
FEATHER = 18           # ширина полосы мягкого края вокруг формы, px исходника

JOBS = [
    # (файл, цвет фона, порог формы, порог мягкого края)
    ("assets/kmv-air.png", (255, 255, 255), 16, 6),
    ("assets/kmv-ice.png", (255, 255, 255), 16, 6),
    # У земли фон не чистый белый, а 253. Порог выше остальных: под знаком
    # нарисована серая тень, при низком пороге она попадала в форму и на
    # светлой странице читалась как грязная полоса под треугольником.
    ("assets/kmv-earth.png", (253, 253, 253), 70, 40),
]

GLOW_JOBS = [
    # (файл, порог яркого тела, смыкание контура, прирост под фаску)
    ("assets/kmv-fire.png", 170, 12, 3),
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


def _disk(radius):
    y, x = np.ogrid[-radius:radius + 1, -radius:radius + 1]
    return x * x + y * y <= radius * radius


def cut_glow(path, body_threshold, close_radius, grow_radius):
    """Знак на чёрном с огненным ореолом вокруг.

    Тут cut() не годится: «всё, что не фон» захватывает и дым, и он оставляет
    вдоль граней тёмную зубчатую корку. Берём только яркое тело знака, а форму
    достраиваем морфологией:

    * порог по яркости отсекает ореол целиком;
    * борозды вокруг букв соединены с внешним фоном тёмными протоками, поэтому
      binary_fill_holes сам по себе их не заливает — сначала смыкаем контур
      (closing), иначе по буквам идёт белая кайма;
    * лёгкое расширение возвращает тёмную фаску по внешнему краю треугольника.

    Цвет не разбеливаем: альфа жёсткая, подмешанного фона в ней нет.
    """
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)

    body = rgb.max(axis=2) > body_threshold
    labels, count = ndimage.label(body)
    sizes = ndimage.sum(np.ones_like(labels), labels, range(1, count + 1))
    body = labels == 1 + int(np.argmax(sizes))          # сам знак, без искр

    shape = ndimage.binary_fill_holes(ndimage.binary_closing(body, _disk(close_radius)))
    shape = ndimage.binary_dilation(shape, _disk(grow_radius))
    alpha = np.asarray(
        Image.fromarray((shape * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))
    )

    image = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")
    image = image.crop(image.getbbox())
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
    for path, body_threshold, close_radius, grow_radius in GLOW_JOBS:
        target, size = cut_glow(path, body_threshold, close_radius, grow_radius)
        print(target, size)
