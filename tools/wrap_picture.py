"""Оборачивает <img> в <picture> с AVIF-источником.

Разметка получается такой:

    <picture>
      <source srcset="…​.avif" type="image/avif" />
      <img src="…​.webp" … />
    </picture>

Браузер без поддержки AVIF молча берёт <img> — то есть прежний файл.
Оборачиваются только те картинки, для которых AVIF реально существует
(tools/make_avif.py пропускает случаи, где AVIF тяжелее WebP).

    python tools/wrap_picture.py
"""

import os
import re

PAGES = ["index.html", "catalog.html", "story.html", "documents.html", "privacy.html"]

IMG_RE = re.compile(r'<img\b[^>]*?/?>', re.IGNORECASE)
SRC_RE = re.compile(r'\bsrc="([^"]+)"')


def avif_for(src):
    """Путь к AVIF рядом с исходником, если он был сгенерирован."""
    base, ext = os.path.splitext(src)
    if ext.lower() not in (".webp", ".jpg", ".jpeg", ".png"):
        return None
    candidate = base + ".avif"
    return candidate if os.path.exists(candidate) else None


def wrap(page):
    text = open(page, encoding="utf-8").read()
    wrapped = 0
    skipped = []

    def replace(match):
        nonlocal wrapped
        tag = match.group(0)
        # Уже внутри <picture> — второй раз не оборачиваем.
        start = max(0, match.start() - 400)
        if "<picture" in text[start:match.start()] and "</picture>" not in text[start:match.start()]:
            return tag
        src_match = SRC_RE.search(tag)
        if not src_match:
            return tag
        src = src_match.group(1)
        avif = avif_for(src)
        if not avif:
            skipped.append(src)
            return tag
        wrapped += 1
        indent = ""
        line_start = text.rfind("\n", 0, match.start()) + 1
        indent = text[line_start:match.start()]
        if indent.strip():
            indent = ""
        return (
            "<picture>\n"
            + indent + '  <source srcset="' + avif + '" type="image/avif" />\n'
            + indent + "  " + tag + "\n"
            + indent + "</picture>"
        )

    out = IMG_RE.sub(replace, text)
    if out != text:
        open(page, "w", encoding="utf-8", newline="\n").write(out)
    return wrapped, skipped


def main():
    for page in PAGES:
        wrapped, skipped = wrap(page)
        print(f"{page}: обёрнуто {wrapped}")
        for src in skipped:
            print(f"    без avif: {src}")


if __name__ == "__main__":
    main()
