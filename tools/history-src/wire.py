"""Заводит «Историю» в меню и подвал всех страниц.

Прежний пункт «История» вёл на story.html — легенду бренда. Хроника предприятия
теперь живёт на history.html, а story.html переименован в «Легенду бренда».
"""
import io
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = "../.."
os.chdir(ROOT)

PAGES = ["index.html", "catalog.html", "documents.html", "awards.html",
         "story.html", "news.html", "charity.html", "privacy.html"]

# два варианта разметки: на внутренних страницах атрибуты идут в другом порядке
NAV_OLD = [
    '<li><a data-en="Our story" href="story.html">История</a></li>',
    '<li><a data-en="Our story" href="story.html" aria-current="page">История</a></li>',
    '<li><a href="story.html" data-en="Our story">История</a></li>',
]
NAV_NEW = [
    '<li><a data-en="History" href="history.html">История</a></li>\n'
    '<li><a data-en="Brand legend" href="story.html">Легенда бренда</a></li>',

    '<li><a data-en="History" href="history.html">История</a></li>\n'
    '<li><a data-en="Brand legend" href="story.html" aria-current="page">Легенда бренда</a></li>',

    '<li><a href="history.html" data-en="History">История</a></li>\n'
    '        <li><a href="story.html" data-en="Brand legend">Легенда бренда</a></li>',
]

FOOT_OLD = [
    '<a href="catalog.html"><span data-en="Products">Продукция</span></a>',
    '<a href="catalog.html" data-en="Products">Продукция</a>',
]
FOOT_NEW = [
    '<a href="catalog.html"><span data-en="Products">Продукция</span></a>\n'
    '<a href="history.html"><span data-en="History">История</span></a>',

    '<a href="catalog.html" data-en="Products">Продукция</a>\n'
    '      <a href="history.html" data-en="History">История</a>',
]

for page in PAGES:
    src = io.open(page, encoding="utf-8").read()
    before = src
    for old, new in zip(NAV_OLD, NAV_NEW):
        if old in src:
            src = src.replace(old, new, 1)
            break
    else:
        print("!! пункт меню не найден:", page)
    for old, new in zip(FOOT_OLD, FOOT_NEW):
        if old in src:
            src = src.replace(old, new, 1)
            break
    else:
        print("!! ссылка в подвале не найдена:", page)
    if src != before:
        io.open(page, "w", encoding="utf-8", newline="").write(src)
        print("правлено:", page)
