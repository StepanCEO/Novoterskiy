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
   404. Ссылки в кириллице сломали бы пять картинок в разделе.

Скрипт берёт текущие файлы репозитория, применяет обе поправки и кладёт
результат в OUT_DIR — оттуда их и заливать, ничего больше не правя руками.

    python tools/make_prod_files.py index.html production.html
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

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, os.path.basename(name))
    with open(out, "w", encoding="utf-8", newline="") as handle:
        handle.write(result)

    left = len(re.findall(r"[а-яё]+(?=\.(?:avif|webp|jpg))", result, re.IGNORECASE))
    print(f"{out}: адресов заменено "
          f"{source.count(PAGES_ORIGIN)}, картинок переименовано "
          f"{sum(source.count(f'assets/scroll/{c}.') for c in SCROLL_NAMES)}, "
          f"осталось кириллических имён файлов: {left}")


if __name__ == "__main__":
    for target in sys.argv[1:] or ["index.html", "production.html"]:
        convert(target)
