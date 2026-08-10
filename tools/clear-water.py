# -*- coding: utf-8 -*-
"""Возвращает прозрачность бутылкам, снятым на белом циклораме.

Сквозь пустую (прозрачную) часть бутылки на таком фоне видно тот же белый
циклорам, поэтому на снимке вода лежит в диапазоне 240–252 — это почти
бумага сайта (#FBFCFE). Корпус читается как сплошное белое пятно, то есть
«молоко»; у зелёного стекла «целебной» такой беды нет.

Скрипт ничего не дорисовывает: он растягивает те несколько уровней яркости,
которые в кадре уже есть (рёбра ПЭТ, блики, стенки, дно), и уводит их в
холодный тон. Этикетка, крышка и знаки не трогаются — маска берёт только
светлые и нейтральные по цвету пиксели.

Сила растяжки считается от самого снимка: у одних кадров разброс 3 уровня,
у других 8, поэтому фиксированный коэффициент одни бы не вытянул, а другие
пережёг.

Запуск:  python tools/clear-water.py [--preview]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent

# Снимки «питьевой» 0,5 л, где корпус вымыт в белизну: средняя яркость стекла
# 241–245 при разбросе меньше 5 уровней. Остальные кадры прогонять нельзя:
# у 0,33 л запас контраста вдвое больше и растяжка делает её грязной, а ПЭТ
# «целебной» бирюзовый — маска берёт только воду внутри, и бутылка расслаивается.
TARGETS = ["pityevaya-pet-05", "pityevaya-pet-05-8"]

PAPER = (251, 252, 254)  # --paper, фон страницы

TARGET_MEAN = 214.0      # куда опускаем среднюю яркость корпуса
TARGET_SPREAD = 14.0     # какой разброс яркости хотим получить
GAIN_LIMITS = (1.5, 4.0)
TINT = (16.0, 6.0, 0.0)  # сколько снять с R и G — получается холодный тон


def glass_mask(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Маска стекла: пиксель светлый и нейтральный по цвету.

    Всё синее (этикетка, крышка), красное (знак) и тёмное (текст) отсекается.
    """
    lo, hi = rgb.min(2), rgb.max(2)
    mask = np.clip((lo - 200.0) / 35.0, 0, 1) * np.clip((28.0 - (hi - lo)) / 14.0, 0, 1)
    return mask * (alpha / 255.0)


def clear_water(im: Image.Image) -> Image.Image:
    src = np.asarray(im.convert("RGBA")).astype(np.float32)
    rgb, alpha = src[..., :3], src[..., 3]

    mask = glass_mask(rgb, alpha)
    core = mask > 0.9
    if core.sum() < 500:
        return im.convert("RGBA")

    lum = rgb[core].mean(1)
    gain = float(np.clip(TARGET_SPREAD / max(lum.std(), 0.5), *GAIN_LIMITS))

    # Размываем границу маски, иначе на стыке с этикеткой будет видна ступенька.
    mask = np.asarray(
        Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)),
        dtype=np.float32,
    ) / 255.0

    out = TARGET_MEAN + (rgb - lum.mean()) * gain - np.array(TINT, dtype=np.float32)
    out = np.clip(out, 0, 255)

    m = mask[..., None]
    res = np.concatenate([rgb * (1 - m) + out * m, alpha[..., None]], axis=2)
    return Image.fromarray(np.clip(res, 0, 255).astype(np.uint8), "RGBA")


def on_paper(im: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", im.size, PAPER + (255,))
    return Image.alpha_composite(bg, im.convert("RGBA")).convert("RGB")


def main() -> None:
    preview = "--preview" in sys.argv
    sheet = []
    for name in TARGETS:
        src = ROOT / "assets/products" / (name + ".webp")
        im = Image.open(src)
        fixed = clear_water(im)
        if preview:
            sheet.append((on_paper(im), on_paper(fixed)))
            continue
        fixed.save(src, "WEBP", quality=88, method=6)
        fixed.save(src.with_suffix(".avif"), "AVIF", quality=70)
        print("written", name)

    if preview:
        pad, h = 16, max(p[0].height for p in sheet)
        w = sum(a.width + b.width + pad * 3 for a, b in sheet)
        strip = Image.new("RGB", (w, h + pad * 2), PAPER)
        x = pad
        for a, b in sheet:
            strip.paste(a, (x, pad)); x += a.width + pad
            strip.paste(b, (x, pad)); x += b.width + pad * 2
        out = ROOT / "tools/.crossbrowser/pet-sheet.png"
        strip.save(out)
        print("preview ->", out, strip.size)


if __name__ == "__main__":
    main()
