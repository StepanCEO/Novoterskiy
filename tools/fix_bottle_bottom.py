"""Возвращает дно бутылкам, у которых его съела вырезка фона.

Кадры стеклянной «Целебной» присланы отделёнными от чёрного фона, и маска у них
строилась по яркости. У стекла дно — самое тёмное место кадра: там толстая
пятка, свет сквозь неё не идёт, яркость падает до уровня фона. Порог не может
отличить такой пиксель от чёрного поля, поэтому нижняя треть бутылки уходила в
прозрачность, и на светлом фоне каталога бутылка растворялась, не доходя до
низа.

Цвет при этом никуда не делся: в webp под альфой 0 лежит та же зелёная пятка.
Скрипт ничего не дорисовывает — он только пересобирает маску по цвету, а не по
яркости: всё, что не чёрное поле, попадает в форму, дыры внутри заливаются.
Старая альфа остаётся там, где она больше новой, — мягкий край по контуру
бутылки уже посчитан правильно, портить его незачем.

    python tools/fix_bottle_bottom.py
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

OUT_DIR = "assets/products"

# Порог «это не фон». Поле вокруг бутылки — чистый чёрный (max-канал ≤ 4),
# у пятки даже в тени зелёный канал держится за 60. Промежуток широкий, и 28
# лежит посередине: шум сжатия по краям кадра не подхватывается, стекло — да.
CONTENT_LEVEL = 28
CLOSING = 7      # закрываем щели между рёбрами и бликами, px
MIN_PART = 0.02  # компонент меньше 2% формы — пыль, а не часть бутылки

# Кадры со съеденным дном. Остальные позиции каталога проверены тем же способом:
# у них прирост маски меньше 3% и лежит он по всему контуру — это обычная
# разница в растушёвке края, а не потерянная часть предмета.
TARGETS = [
    "celebnaya-glass-elita-05",
    "celebnaya-glass-elita-05-2",
    "celebnaya-glass-elita-05-6",
]


def shape_by_colour(rgb):
    """Форма предмета: всё, что ярче чёрного поля, одним куском и без дыр."""
    core = ndimage.binary_closing(rgb.max(axis=2) > CONTENT_LEVEL,
                                  np.ones((CLOSING, CLOSING)))
    labels, count = ndimage.label(core)
    if count:
        sizes = ndimage.sum(core, labels, range(1, count + 1))
        core = np.isin(labels, np.arange(1, count + 1)[sizes > sizes.max() * MIN_PART])
    return ndimage.binary_fill_holes(core)


def repair(name):
    path = os.path.join(OUT_DIR, f"{name}.webp")
    source = np.array(Image.open(path).convert("RGBA")).astype(np.float32)
    rgb, old = source[:, :, :3], source[:, :, 3]

    shape = shape_by_colour(rgb)
    # Крайний ряд пикселей формы делаем полупрозрачным: у восстановленной пятки
    # край иначе получается ступенчатым — маска-то строилась по одному порогу.
    inner = ndimage.binary_erosion(shape, np.ones((3, 3)))
    edge = np.where(shape, np.where(inner, 1.0, 0.55), 0.0)

    alpha = np.maximum(old, edge * 255.0)
    gained = ((alpha > 10) & (old <= 10)).sum()

    image = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")
    image.save(path, quality=92, method=6)
    image.save(os.path.join(OUT_DIR, f"{name}.avif"), quality=80)
    print(f"{name}: вернулось {gained} px ({gained / max((old > 10).sum(), 1):.1%} формы)")


if __name__ == "__main__":
    for target in TARGETS:
        repair(target)
