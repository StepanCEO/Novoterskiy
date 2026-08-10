"""Пересобирает каталог по content/products.json.

В catalog.html лежат две копии линейки: разметка-заглушка внутри
.collection-track (её видит поисковик и пользователь с выключенным JS) и
ItemList в JSON-LD. Обе повторяют то, что cms.js рисует из products.json, и
расходятся при каждой правке руками — этот скрипт переписывает их из одного
источника.

    python tools/sync_catalog.py
"""

import json
import os
import re

PRODUCTS = "content/products.json"
CATALOG = "catalog.html"
SITE = "https://stepanceo.github.io/Novoterskiy"

CHEVRON = ('<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
           '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" '
           'stroke-linecap="round" stroke-linejoin="round" /></svg>')

SELLER = {
    "@type": "Organization",
    "name": "ООО «Велнесс Фонтейн Премиум»",
    "telephone": "+7-495-133-59-41",
    "email": "sales@wfpremium.ru",
}


def esc(value):
    return (str(value or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def shots(product):
    """Герой из photo/photo_* плюс gallery — тот же порядок, что в cms.js."""
    alt = product.get("alt_ru") or f"{product['title']} — {product['type']}"
    first = {
        "photo": product["photo"],
        "width": product.get("photo_width"),
        "height": product.get("photo_height"),
        "alt_ru": alt,
        "alt_en": product.get("alt_en") or alt,
        "caption_ru": product.get("photo_caption_ru"),
        "caption_en": product.get("photo_caption_en"),
    }
    rest = [{
        "photo": shot["photo"],
        "width": shot.get("photo_width"),
        "height": shot.get("photo_height"),
        "alt_ru": shot.get("alt_ru") or alt,
        "alt_en": shot.get("alt_en") or shot.get("alt_ru") or alt,
        "caption_ru": shot.get("caption_ru"),
        "caption_en": shot.get("caption_en"),
    } for shot in product.get("gallery") or []]
    return [first] + rest


def volume(title):
    """Хвостовое число названия — объём; в вёрстке он идёт отдельным <em>."""
    match = re.match(r"^(.*\S)\s+([\d.,]+)$", str(title))
    return match.groups() if match else (title, "")


def seo_name(product, ambiguous):
    """Имя для JSON-LD: «Новотерская Целебная 0,5 л, стекло «Элита»».

    Строится из названия и типа, а не берётся из alt: alt описывает конкретный
    снимок («короб, 12 бутылок»), а в разметке товара нужно имя позиции.
    """
    head, vol = volume(product["title"])
    family = "Целебная" if "целебная" in head.lower() else "Питьевая"
    pack = product["type"].split("·")[-1].strip()
    name = f"Новотерская {family} {vol.replace('.', ',')} л, {pack}"
    if ambiguous:
        # Питьевая 1,5 л выходит и газированной, и негазированной: без этого
        # хвоста в ItemList оказались бы два товара с одинаковым именем.
        name += ", " + product["type"].split("·")[0].strip().lower()
    return name


def track_markup(products):
    out = []
    for product in products:
        pictures = shots(product)
        head_ru, vol = volume(product["title"])
        head_en, _ = volume(product.get("title_en") or product["title"])
        title_ru = f"{esc(head_ru)} <em>{esc(vol)}</em>" if vol else esc(head_ru)
        title_en = f"{esc(head_en)} <em>{esc(vol)}</em>" if vol else esc(head_en)

        # --pscale задаёт долю высоты бокса: она же читается из products.json
        # в cms.js, так что заглушка и живая разметка совпадают.
        scale = product.get("scale")
        lift = product.get("lift")
        rules = []
        if scale and scale != 1:
            rules.append(f"--pscale:{scale:g}")
        if lift:
            rules.append(f"--plift:{lift:g}px")
        style = f' style="{";".join(rules)}"' if rules else ""
        out.append(f'    <article class="product reveal"{style}>')
        out.append('      <div class="product-photo">')
        for index, shot in enumerate(pictures):
            base = os.path.splitext(shot["photo"])[0]
            out.append(f'        <picture class="pshot{" is-on" if not index else ""}">')
            out.append(f'          <source srcset="{esc(base)}.avif" type="image/avif" />')
            out.append(f'          <img src="{esc(shot["photo"])}" width="{shot["width"]}" '
                       f'height="{shot["height"]}" loading="lazy" alt="{esc(shot["alt_ru"])}" '
                       f'data-alt-ru="{esc(shot["alt_ru"])}" data-alt-en="{esc(shot["alt_en"])}" />')
            out.append('        </picture>')
        if len(pictures) > 1:
            for direction, ru, en in (("prev", "Предыдущее фото", "Previous photo"),
                                      ("next", "Следующее фото", "Next photo")):
                out.append(f'        <button class="pnav pnav-{direction}" type="button">{CHEVRON}'
                           f'<span class="sr-only" data-en="{esc(en)}">{esc(ru)}</span></button>')
        out.append('      </div>')
        if len(pictures) > 1:
            out.append('      <div class="product-dots">')
            for index, shot in enumerate(pictures):
                ru = shot["caption_ru"] or f"Фото {index + 1}"
                en = shot["caption_en"] or f"Photo {index + 1}"
                out.append(f'        <button class="pdot{" is-on" if not index else ""}" type="button" '
                           f'aria-pressed="{"true" if not index else "false"}">'
                           f'<span class="sr-only" data-en="{esc(en)}">{esc(ru)}</span></button>')
            out.append('      </div>')
        out.append(f'      <h2 data-en="{esc(title_en)}">{title_ru}</h2>')
        out.append(f'      <p class="product-type" data-en="{esc(product.get("type_en") or product["type"])}">'
                   f'{esc(product["type"])}</p>')
        out.append(f'      <a class="btn btn-outline" href="{esc(product.get("buy_url") or "buy.html")}" '
                   f'data-analytics="product-buy" data-product="{esc(product["id"])}" '
                   f'data-en="Buy">Купить</a>')
        out.append('    </article>')
    return "\n".join(out)


def jsonld(products):
    names = [seo_name(p, False) for p in products]
    elements = []
    for position, product in enumerate(products, 1):
        name = seo_name(product, names.count(seo_name(product, False)) > 1)
        elements.append({
            "@type": "ListItem",
            "position": position,
            "item": {
                "@type": "Product",
                "name": name,
                "category": ("Минеральная природная питьевая вода"
                             if "целебная" in product["title"].lower() else "Питьевая вода"),
                "image": f"{SITE}/{product['photo']}",
                "material": "Стекло" if "glass" in product["id"] else "ПЭТ",
                "brand": {"@type": "Brand", "name": "Новотерская"},
                "manufacturer": {"@type": "Organization", "name": "АО «Кавминводы»"},
                "offers": {
                    "@type": "AggregateOffer",
                    "availability": "https://schema.org/InStock",
                    "priceCurrency": "RUB",
                    "seller": SELLER,
                },
            },
        })
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Каталог «Новотерская»",
        "itemListOrder": "https://schema.org/ItemListOrderAscending",
        "numberOfItems": len(products),
        "itemListElement": elements,
    }, ensure_ascii=False, indent=2)


def replace(html, opening, closing, body):
    start = html.index(opening) + len(opening)
    end = html.index(closing, start)
    return html[:start] + "\n" + body + "\n" + html[end:], end - start


# Границы линейки. Раньше конец искался по строке «  </div>», но эта же
# последовательность встречается внутри карточки — в «      </div>» у
# .product-photo. Замена обрывалась на первой карточке, а хвост прежней
# линейки оставался в разметке: он вываливался из .collection-track прямо в
# секцию и рисовался под каталогом столбиком из чужих карточек. Теперь конец
# привязан к следующему блоку — промахнуться мимо него нельзя.
TRACK = re.compile(r'(<div class="collection-track">).*?(\n  </div>\s*\n\s*<div class="catalog-foot)', re.S)


def main():
    products = json.load(open(PRODUCTS, encoding="utf-8"))["items"]
    html = open(CATALOG, encoding="utf-8").read()
    html, _ = replace(html, '<script type="application/ld+json">', "</script>", jsonld(products))
    html, hit = TRACK.subn(lambda m: m.group(1) + "\n" + track_markup(products) + m.group(2),
                           html, count=1)
    if hit != 1:
        raise SystemExit(f"{CATALOG}: не нашёл границы .collection-track")
    open(CATALOG, "w", encoding="utf-8", newline="\n").write(html)
    print(f"{CATALOG}: {len(products)} позиций")


if __name__ == "__main__":
    main()
