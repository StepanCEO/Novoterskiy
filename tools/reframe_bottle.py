"""Оставляет в кадре одну бутылку и кадрирует по её силуэту.

У 0,33 л под бутылкой висели обрезки стеклянного блика — куски чужого кадра,
которые вырезка фона приняла за предмет. Убрать их прямоугольной обрезкой
нельзя: у этой бутылки узкая пятка, и любая линия, которая отсекает обрезки,
заодно срезает дно — на светлом фоне каталога бутылка встаёт как без дна.

Скрипт работает по форме, а не по прямоугольнику. Сначала непрозрачные пиксели
делятся на связные куски и остаётся самый крупный — сама бутылка; так уходят
обрезки, лежащие отдельно. Потом строчный фильтр: бутылка снята в лоб, поэтому
в каждой строке её силуэт — один отрезок, и он пересекает ось кадра. Всё, что
лежит в строке отдельным отрезком в стороне, — прилипший к пятке хвост чужого
блика, и он гасится. Дальше кадр обрезается по силуэту с полем PAD и тянется до
высоты каталога — той же, что у соседних карточек, чтобы линия низа совпадала.

    python tools/reframe_bottle.py
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

OUT_DIR = "assets/products"
OUT_HEIGHT = 815  # высота карточки, как у остальных бутылок каталога
PAD = 6           # поля вокруг силуэта, px исходника
SOLID = 10        # альфа, ниже которой пиксель считается фоном
CLOSING = 5       # закрываем щели между бликами, чтобы бутылка была одним куском
MIN_PART = 0.2    # кусок меньше 20% главного — не часть бутылки

TARGETS = ["pityevaya-pet-033"]


ROW = np.array([[0, 0, 0], [1, 1, 1], [0, 0, 0]])  # связность только по строке


def main_shape(alpha):
    """Самый крупный связный кусок маски — сама бутылка."""
    mask = ndimage.binary_closing(alpha > SOLID, np.ones((CLOSING, CLOSING)))
    labels, count = ndimage.label(mask)
    if count > 1:
        sizes = ndimage.sum(mask, labels, range(1, count + 1))
        mask = labels == (int(np.argmax(sizes)) + 1)
    # Дыры заливаем до строчного фильтра: прозрачная вода внутри корпуса рвёт
    # строку на куски, и без заливки половина бутылки сочлась бы посторонней.
    return ndimage.binary_fill_holes(mask)


def on_axis(shape):
    """Отрезки строк, которые пересекают ось кадра, — сама бутылка."""
    axis = int(round(np.where(shape)[1].mean()))
    rows, _ = ndimage.label(shape, structure=ROW)
    return np.isin(rows, list(set(rows[shape[:, axis], axis])))


def reframe(name):
    path = os.path.join(OUT_DIR, f"{name}.webp")
    source = np.array(Image.open(path).convert("RGBA"))
    alpha = source[:, :, 3].copy()  # копия: ниже альфа в кадре переписывается

    shape = on_axis(main_shape(alpha))
    source[:, :, 3] = np.where(shape, alpha, 0)

    ys, xs = np.where(shape)
    y0, y1 = max(ys.min() - PAD, 0), min(ys.max() + PAD + 1, shape.shape[0])
    x0, x1 = max(xs.min() - PAD, 0), min(xs.max() + PAD + 1, shape.shape[1])

    image = Image.fromarray(source[y0:y1, x0:x1], "RGBA")
    width = max(round(image.width * OUT_HEIGHT / image.height), 1)
    image = image.resize((width, OUT_HEIGHT), Image.LANCZOS)

    image.save(path, quality=92, method=6)
    image.save(os.path.join(OUT_DIR, f"{name}.avif"), quality=80)
    print(f"{name}: {image.width}x{image.height}, отброшено "
          f"{int(((alpha > SOLID) & ~shape).sum())} px мусора")


if __name__ == "__main__":
    for target in TARGETS:
        reframe(target)
