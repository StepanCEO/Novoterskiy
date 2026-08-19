"""Готовит страницы репозитория к ручной заливке на novoterskaya.ru.

Прод — отдельная площадка (см. память проекта): файлы туда попадают руками
через файловый менеджер хостинга, а не пушем. И версия на проде отличается от
репозитория двумя вещами, которые нельзя терять при заливке:

1. Канонические адреса. В репозитории canonical, hreflang, og:url, og:image и
   JSON-LD ведут на GitHub Pages — это правильно для Pages и вредно для прода:
   залив файл как есть, мы говорим поисковику, что настоящий адрес страницы —
   на github.io.
2. Имена картинок ленты «Воздух — Лёд — Земля — Огонь — Источник». В репозитории
   они кириллицей, на хостинге лежат латиницей: кириллические имена там отдают
   404. Ссылки в кириллице сломали бы пять картинок в разделе. Имена приходят с
   двух сторон — из разметки index.html и из content/site.json, откуда cms.js
   переписывает картинки поверх неё, — так что править надо оба файла.

Скрипт берёт текущие файлы репозитория, применяет обе поправки и кладёт
результат в OUT_DIR, повторяя путь внутри проекта: content/site.json попадёт в
tools/prod-upload/content/site.json — то есть структура папок совпадает с
хостингом, и заливать можно не думая, что куда.

    python tools/make_prod_files.py index.html production.html content/site.json
"""

import os
import re
import sys

OUT_DIR = "tools/prod-upload"

PAGES_ORIGIN = "https://stepanceo.github.io/Novoterskiy/"
PROD_ORIGIN = "https://novoterskaya.ru/"

# Имена кадров ленты: как в репозитории -> как лежит на хостинге.
SCROLL_NAMES = {
    "воздух": "air",
    "лед": "ice",
    "земля": "earth",
    "огонь": "fire",
    "источник": "source",
}


def to_prod(html):
    """Правит адреса и имена картинок под прод, остальное не трогает."""
    html = html.replace(PAGES_ORIGIN, PROD_ORIGIN)
    for cyrillic, latin in SCROLL_NAMES.items():
        html = html.replace(f"assets/scroll/{cyrillic}.", f"assets/scroll/{latin}.")
    return html


def convert(name):
    with open(name, encoding="utf-8", newline="") as handle:
        source = handle.read()
    result = to_prod(source)

    out = os.path.join(OUT_DIR, name.replace("\\", "/"))
    os.makedirs(os.path.dirname(out) or OUT_DIR, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="") as handle:
        handle.write(result)

    left = len(re.findall(r"[а-яё]+(?=\.(?:avif|webp|jpg))", result, re.IGNORECASE))
    print(f"{out}: адресов заменено "
          f"{source.count(PAGES_ORIGIN)}, картинок переименовано "
          f"{sum(source.count(f'assets/scroll/{c}.') for c in SCROLL_NAMES)}, "
          f"осталось кириллических имён файлов: {left}")


if __name__ == "__main__":
    for target in sys.argv[1:] or ["index.html", "production.html", "content/site.json"]:
        convert(target)
