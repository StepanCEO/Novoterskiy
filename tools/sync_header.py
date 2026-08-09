"""Пересобирает шапку на всех страницах из одного шаблона.

Раньше `<header class="site-header">` лежал двенадцатью копиями: на главной —
с якорями вида «#origin», на внутренних — с «index.html#origin» и классом
is-solid. Любая правка меню требовала двенадцати одинаковых замен, и страницы
расходились. Здесь шапка описана один раз, а различия сведены к двум вещам:
адресу главной и префиксу якорей.

Пункт текущей страницы получает aria-current="page" — по имени файла в ссылке,
так что отдельного списка «какая страница где подсвечена» держать не нужно.

    python tools/sync_header.py
"""

import glob
import re

# Иконки набраны в одной сетке 24x24 контуром: заливка сделала бы их тяжелее
# подписи, а в плашке пиктограмма должна читаться как знак, а не как пятно.
ICONS = {
    # Завод: две ступени корпуса и труба — самый честный знак для «О компании».
    "about": '<path d="M3 20.2h18"/><path d="M4.4 20.2v-8.4l4.8 2.8v-2.8l4.8 2.8V7.6h5.6v12.6"/>'
             '<path d="M16.4 7.6V4.4h1.9v3.2"/>',
    # Две бутылки: линейка, а не одна позиция.
    "products": '<g transform="translate(3.5 0)"><path d="M2.6 2.8h2.9v2.4l1.2 1.8c.3.5.5 1 .5 1.6v9.6a2.6 2.6 0 0 1-2.6 '
                '2.6H3.5A2.6 2.6 0 0 1 .9 18.2V8.6c0-.6.2-1.1.5-1.6l1.2-1.8V2.8Z"/><path d="M.9 10.6h6.3"/>'
                '<path d="M12.1 2.8H15v2.4l1.2 1.8c.3.5.5 1 .5 1.6v9.6a2.6 2.6 0 0 1-2.6 2.6H13a2.6 2.6 0 0 1-2.6-2.6V8.6'
                'c0-.6.2-1.1.5-1.6l1.2-1.8V2.8Z"/><path d="M10.4 10.6h6.3"/></g>',
    "news": '<path d="M4.2 6h12.2v12.4a2 2 0 0 0 2 2H6.2a2 2 0 0 1-2-2V6Z"/><path d="M16.4 9.4h3.4v9a2 2 0 0 1-2 2"/>'
            '<path d="M7 9.4h6.6M7 12.4h6.6M7 15.4h4"/>',
    # Двуглавая вершина — тот же Эльбрус, что в легенде бренда. Пики подняты
    # к верху сетки: на высоте остальных знаков гора вышла бы плоской полоской
    # у нижнего края и в строке читалась бы вдвое мельче соседей.
    "origin": '<path d="M2.2 19.8h19.6"/><path d="m2.2 19.8 6.3-13.4 2.7 5.7"/>'
              '<path d="m9.2 19.8 5.6-11.6 7 11.6"/>',
    "contacts": '<rect x="2.8" y="5.4" width="18.4" height="13.2" rx="2.6"/>'
                '<path d="m3.8 7.6 6.9 5.1a2.2 2.2 0 0 0 2.6 0l6.9-5.1"/>',
}

# Порядок пунктов повторяет header.nav в content/site.json: cms.js подставляет
# подписи по номеру, а не по тексту.
NAV = [
    ("about", "О компании", "About us", "navSubAbout", [
        ("Производство", "Production", "{p}#production"),
        ("Лаборатория", "Laboratory", "lab.html"),
        ("Документы", "Documents", "documents.html"),
        ("Награды", "Awards", "awards.html"),
        ("История", "History", "history.html"),
        ("Легенда бренда", "Brand legend", "story.html"),
    ]),
    ("products", "Продукция", "Products", "navSubProducts", [
        ("Каталог", "Catalog", "catalog.html"),
        ("Состав воды", "Water composition", "composition.html"),
    ]),
    ("news", "Новости", "News", "navSubNews", [
        ("Общие", "General", "news.html"),
        ("Благотворительность", "Charity", "charity.html"),
    ]),
    ("origin", "Источник", "Origin", None, "{p}#origin"),
    ("contacts", "Контакты", "Contacts", None, "{p}#contacts"),
]

CTA = ("Где купить", "Where to buy", "buy.html")

BURGER = ('<button aria-controls="siteNav" aria-expanded="false" class="nav-burger" id="navBurger" type="button">'
          '<span aria-hidden="true" class="burger-box"><span class="burger-line"></span>'
          '<span class="burger-line"></span><span class="burger-line"></span></span>'
          '<span class="sr-only" data-en="Menu">Меню</span></button>')

LANG = ('<button class="lang-toggle" id="langToggle" type="button">'
        '<span class="lang-opt is-active" data-lang="ru">RU</span><span class="lang-sep">·</span>'
        '<span class="lang-opt" data-lang="en">EN</span>'
        '<span class="sr-only" data-en=" - switch language"> — сменить язык</span></button>')


def icon(key):
    return ('<span aria-hidden="true" class="nav-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + ICONS[key] + "</svg></span>")


def current(href, page):
    """Подсветка активного пункта: сравниваем имя файла без якоря."""
    return ' aria-current="page"' if href.split("#")[0] == page else ""


def nav_markup(page, prefix):
    out = []
    for key, ru, en, sub_id, target in NAV:
        label = f'<span class="nav-label" data-en="{en}">{ru}</span>'
        if sub_id is None:
            href = target.format(p=prefix)
            out.append(f'<a class="nav-link" href="{href}"{current(href, page)}>{icon(key)}'
                       f'<span class="nav-text">{label}</span></a>')
            continue
        out.append('<div class="nav-item">')
        out.append(f'<button aria-controls="{sub_id}" aria-expanded="false" class="nav-link nav-toggle" '
                   f'type="button">{icon(key)}<span class="nav-text">{label}'
                   f'<span aria-hidden="true" class="nav-caret"></span></span></button>')
        out.append(f'<ul class="nav-sub" id="{sub_id}">')
        for sub_ru, sub_en, sub_href in target:
            href = sub_href.format(p=prefix)
            out.append(f'<li><a data-en="{sub_en}" href="{href}"{current(href, page)}>{sub_ru}</a></li>')
        out.append("</ul>")
        out.append("</div>")
    # Второй экземпляр кнопки — для панели меню. На узком экране «Где купить»
    # рядом с логотипом, языком и бургером не помещается, поэтому в плашке она
    # прячется, а здесь встаёт во всю ширину. Видна всегда ровно одна из двух.
    cta_ru, cta_en, cta_href = CTA
    out.append(f'<a class="nav-cta header-cta" data-en="{cta_en}" href="{cta_href}"'
               f'{current(cta_href, page)}>{cta_ru}</a>')
    return "\n".join(out)


def header_markup(page):
    home = "#top" if page == "index.html" else "index.html"
    prefix = "" if page == "index.html" else "index.html"
    solid = "" if page == "index.html" else " is-solid"
    cta_ru, cta_en, cta_href = CTA
    return "\n".join([
        f'<header class="site-header{solid}" id="top">',
        f'<a aria-label="Новотерская — на главную" class="brand" data-en-aria-label="Novoterskaya - home" '
        f'href="{home}">',
        "<picture>",
        '<source srcset="assets/logo-mark.avif" type="image/avif" />',
        '<img alt="Кавминводы" class="brand-mark" data-en-alt="Kavminvody" height="40" '
        'src="assets/logo-mark.webp" width="59" />',
        "</picture>",
        '<span class="brand-col">',
        '<span class="brand-name"><span data-en="Novoterskaya">Новотерская</span></span>',
        "</span>",
        "</a>",
        '<nav aria-label="Основная навигация" class="site-nav" id="siteNav">',
        nav_markup(page, prefix),
        "</nav>",
        '<div class="header-actions">',
        LANG,
        f'<a class="btn btn-primary header-cta" data-en="{cta_en}" href="{cta_href}"'
        f'{current(cta_href, page)}>{cta_ru}</a>',
        BURGER,
        "</div>",
        "</header>",
    ])


def main():
    pattern = re.compile(r'<header class="site-header.*?</header>', re.S)
    for path in sorted(glob.glob("*.html")):
        html = open(path, encoding="utf-8").read()
        if not pattern.search(html):
            continue
        updated = pattern.sub(lambda _: header_markup(path), html, count=1)
        if updated != html:
            open(path, "w", encoding="utf-8", newline="\n").write(updated)
            print(f"{path}: шапка обновлена")
        else:
            print(f"{path}: без изменений")


if __name__ == "__main__":
    main()
