"""Разбор страницы «История» со старого сайта: адреса фотографий и текст блоков.

Тильда складывает содержимое в обычную разметку, поэтому хватает регулярных
выражений — тащить парсер ради одной разовой выгрузки незачем.
"""
import re
import sys
import json

sys.stdout.reconfigure(encoding="utf-8")

src = open("page.html", encoding="utf-8").read()

img_re = re.compile(r"https://static\.tildacdn\.com/tild[0-9a-f-]+/[^\s\"'\\]+?\.(?:jpg|jpeg|png|webp)", re.I)
seen = []
for url in img_re.findall(src):
    if url not in seen:
        seen.append(url)

print("Фотографий:", len(seen))
for url in seen:
    print("  ", url)

# Текстовые блоки Тильды: заголовки t-title / t-heading и абзацы t-text / t-descr
tag_re = re.compile(r"<(h1|h2|h3|div|p)[^>]*class=\"[^\"]*t-(?:title|heading|text|descr|name)[^\"]*\"[^>]*>(.*?)</\1>", re.S | re.I)
strip_re = re.compile(r"<[^>]+>")

import html as htmlmod
blocks = []
for _, body in tag_re.findall(src):
    text = strip_re.sub(" ", body)
    text = htmlmod.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if text and text not in blocks:
        blocks.append(text)

print("\nТекстовых блоков:", len(blocks))
for b in blocks:
    print("  --", b[:400])

json.dump({"images": seen, "blocks": blocks}, open("history.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
