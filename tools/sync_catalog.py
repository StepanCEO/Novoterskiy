"""Пересобирает каталог по content/products.json.

В catalog.html лежат две копии линейки: разметка-заглушка внутри
.collection-lines (её видит поисковик и пользователь с выключенным JS) и
ItemList в JSON-LD. Обе повторяют то, что cms.js рисует из products.json, и
расходятся при каждой правке руками — этот скрипт переписывает их из одного
источника.

Каталог сгруппирован по линейкам (products.json → lines[]): у каждой свой
разворот — витрина с бутылками слева, название и описание справа. Порядок
позиций внутри линейки задаёт lines[].items, а не порядок в items[].

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


def vol_label(product):
    """Литраж для плашки: «0.5» из названия превращается в «0,5»."""
    return volume(product["title"])[1].replace(".", ",")


def product_markup(product, active, indent):
    """Одна бутылка витрины: плашка с литражом, кадры, точки, подпись."""
    pad = " " * indent
    pictures = shots(product)
    head_ru, vol = volume(product["title"])
    head_en, _ = volume(product.get("title_en") or product["title"])
    # Разделитель дробной части у языков разный: по-русски запятая, по-английски точка.
    title_ru = f"{esc(head_ru)} <em>{esc(vol.replace('.', ','))}</em>" if vol else esc(head_ru)
    title_en = f"{esc(head_en)} <em>{esc(vol.replace(',', '.'))}</em>" if vol else esc(head_en)

    out = [f'{pad}<article class="product stage-item{" is-on" if active else ""}" '
           f'data-product="{esc(product["id"])}">']
    # Литраж дублирует заголовок ниже, поэтому от скринридера он спрятан:
    # иначе позиция озвучивалась бы дважды.
    out.append(f'{pad}  <span class="stage-vol" aria-hidden="true">{vol_pill(product)}</span>')
    out.append(f'{pad}  <div class="product-photo">')
    for index, shot in enumerate(pictures):
        base = os.path.splitext(shot["photo"])[0]
        out.append(f'{pad}    <picture class="pshot{" is-on" if not index else ""}">')
        out.append(f'{pad}      <source srcset="{esc(base)}.avif" type="image/avif" />')
        out.append(f'{pad}      <img src="{esc(shot["photo"])}" width="{shot["width"]}" '
                   f'height="{shot["height"]}" loading="lazy" alt="{esc(shot["alt_ru"])}" '
                   f'data-alt-ru="{esc(shot["alt_ru"])}" data-alt-en="{esc(shot["alt_en"])}" />')
        out.append(f'{pad}    </picture>')
    if len(pictures) > 1:
        for direction, ru, en in (("prev", "Предыдущее фото", "Previous photo"),
                                  ("next", "Следующее фото", "Next photo")):
            out.append(f'{pad}    <button class="pnav pnav-{direction}" type="button">{CHEVRON}'
                       f'<span class="sr-only" data-en="{esc(en)}">{esc(ru)}</span></button>')
    out.append(f'{pad}  </div>')
    if len(pictures) > 1:
        out.append(f'{pad}  <div class="product-dots">')
        for index, shot in enumerate(pictures):
            ru = shot["caption_ru"] or f"Фото {index + 1}"
            en = shot["caption_en"] or f"Photo {index + 1}"
            out.append(f'{pad}    <button class="pdot{" is-on" if not index else ""}" type="button" '
                       f'aria-pressed="{"true" if not index else "false"}">'
                       f'<span class="sr-only" data-en="{esc(en)}">{esc(ru)}</span></button>')
        out.append(f'{pad}  </div>')
    out.append(f'{pad}  <h3 data-en="{esc(title_en)}">{title_ru}</h3>')
    out.append(f'{pad}  <p class="product-type" data-en="{esc(product.get("type_en") or product["type"])}">'
               f'{esc(product["type"])}</p>')
    out.append(f'{pad}</article>')
    return out


def vol_pill(product):
    """Содержимое плашки: число, единица и уточнение тары, если оно есть."""
    # По-русски дробная часть отделяется запятой, по-английски — точкой, поэтому
    # число тоже переключается вместе с языком, а не только единица измерения.
    number = vol_label(product)
    parts = [f'<span class="vol-num" data-en="{esc(number.replace(",", "."))}">{esc(number)}</span>',
             '<span class="vol-unit" data-en="L">л</span>']
    if product.get("badge_ru"):
        parts.append(f'<span class="vol-sub" data-en="{esc(product.get("badge_en") or product["badge_ru"])}">'
                     f'{esc(product["badge_ru"])}</span>')
    return "".join(parts)


def track_markup(lines, by_id):
    out = []
    for line in lines:
        products = [by_id[pid] for pid in line["items"]]
        title_ru = "".join(f"<span>{esc(word)}</span>" for word in line["title_ru"])
        title_en = "".join(f"<span>{esc(word)}</span>" for word in (line.get("title_en") or line["title_ru"]))
        buy_url = esc(line.get("buy_url") or "buy.html")

        out.append(f'    <article class="line reveal" id="line-{esc(line["id"])}">')
        out.append('      <div class="line-body">')
        out.append(f'        <h2 class="line-title" data-en="{esc(title_en)}">{title_ru}</h2>')
        out.append('        <div class="line-stage">')
        out.append('          <div class="stage-view">')
        out.append('            <div class="stage-track">')
        for index, product in enumerate(products):
            out.extend(product_markup(product, not index, 14))
        out.append('            </div>')
        out.append('          </div>')
        # Ряд плашек под витриной — и указатель, и переключатель: тот же приём,
        # что у полосы миниатюр в референсе, только литражом вместо картинок.
        out.append('          <div class="stage-picker" role="group" aria-label="Объём" '
                   'data-en-aria-label="Volume">')
        for index, product in enumerate(products):
            out.append(f'            <button class="pick{" is-on" if not index else ""}" type="button" '
                       f'aria-pressed="{"true" if not index else "false"}">{vol_pill(product)}</button>')
        out.append('          </div>')
        out.append('        </div>')
        out.append('        <div class="line-copy">')
        out.append(f'          <p class="line-text" data-en="{esc(line.get("text_en") or line["text_ru"])}">'
                   f'{esc(line["text_ru"])}</p>')
        out.append(f'          <a class="btn btn-primary line-buy" href="{buy_url}" '
                   f'data-analytics="product-buy" data-product="{esc(products[0]["id"])}" '
                   f'data-en="Buy">Купить</a>')
        out.append('        </div>')
        out.append('      </div>')
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


# Границы линейки. Конец нельзя искать по строке «  </div>»: эта же
# последовательность встречается внутри разворота линейки. Поэтому он привязан
# к следующему блоку — промахнуться мимо него нельзя.
TRACK = re.compile(r'(<div class="collection-lines">).*?(\n  </div>\s*\n\s*<div class="catalog-foot)', re.S)


def main():
    data = json.load(open(PRODUCTS, encoding="utf-8"))
    by_id = {product["id"]: product for product in data["items"]}
    lines = data["lines"]
    missing = [pid for line in lines for pid in line["items"] if pid not in by_id]
    if missing:
        raise SystemExit(f"{PRODUCTS}: в lines[] позиции, которых нет в items[]: {missing}")
    orphans = [pid for pid in by_id if pid not in {p for line in lines for p in line["items"]}]
    if orphans:
        raise SystemExit(f"{PRODUCTS}: позиции не попали ни в одну линейку: {orphans}")
    # Порядок в JSON-LD берём по линейкам: ItemList должен совпадать с тем, что
    # человек видит на странице, иначе позиции в разметке и в вёрстке разъедутся.
    products = [by_id[pid] for line in lines for pid in line["items"]]

    html = open(CATALOG, encoding="utf-8").read()
    html, _ = replace(html, '<script type="application/ld+json">', "</script>", jsonld(products))
    html, hit = TRACK.subn(lambda m: m.group(1) + "\n" + track_markup(lines, by_id) + m.group(2),
                           html, count=1)
    if hit != 1:
        raise SystemExit(f"{CATALOG}: не нашёл границы .collection-lines")
    open(CATALOG, "w", encoding="utf-8", newline="\n").write(html)
    print(f"{CATALOG}: {len(lines)} линеек, {len(products)} позиций")


if __name__ == "__main__":
    main()
