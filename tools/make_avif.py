"""Готовит современные форматы для фотографий сайта.

Для каждого исходника рядом появляется .webp и .avif с тем же именем —
разметка подключает их через <picture>, а .jpg/.webp остаётся запасным
вариантом для старых браузеров.

AVIF пишется только если он реально легче WebP: на плоских картинках с
крупными однотонными участками WebP иногда выигрывает, и тогда лишний
файл только добавляет запросов.

    python tools/make_avif.py
"""

import os
import glob
from PIL import Image

# Качество подобрано по глазам на горных фактурах: ниже 62 у AVIF
# на камнях и мхе появляется «мыло» в тенях.
AVIF_QUALITY = 62
WEBP_QUALITY = 82

# Порог выгоды: если AVIF тяжелее 95% от WebP, он не нужен.
AVIF_GAIN = 0.95


def source_files():
    """Все растровые исходники сайта, кроме служебных PNG-заготовок логотипов."""
    found = []
    for pattern in ("assets/**/*.jpg", "assets/**/*.webp"):
        for path in glob.glob(pattern, recursive=True):
            found.append(path.replace("\\", "/"))
    return sorted(set(found))


def kb(path):
    return os.path.getsize(path) / 1024


def convert(path):
    base, ext = os.path.splitext(path)
    image = Image.open(path)
    # AVIF не умеет палитру, а прозрачность у логотипов нужно сохранить.
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

    made = []

    webp_path = base + ".webp"
    if ext.lower() != ".webp":
        image.save(webp_path, "WEBP", quality=WEBP_QUALITY, method=6)
        made.append(("webp", webp_path))

    avif_path = base + ".avif"
    image.save(avif_path, "AVIF", quality=AVIF_QUALITY)
    if kb(avif_path) > kb(webp_path) * AVIF_GAIN:
        os.remove(avif_path)
        made.append(("avif-skipped", None))
    else:
        made.append(("avif", avif_path))

    return webp_path, made


def main():
    total_before = 0.0
    total_after = 0.0
    for path in source_files():
        webp_path, made = convert(path)
        before = kb(path)
        avif = [m for m in made if m[0] == "avif"]
        after = kb(avif[0][1]) if avif else kb(webp_path)
        total_before += before
        total_after += after
        tag = "avif" if avif else "webp only"
        print(f"{before:8.0f} KB -> {after:7.0f} KB  {tag:10} {path}")
    print(f"\nИтого: {total_before:.0f} KB -> {total_after:.0f} KB "
          f"({100 - total_after / total_before * 100:.0f}% экономии)")


if __name__ == "__main__":
    main()
