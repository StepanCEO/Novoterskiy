# Снимки к старым новостям: качаем всё, что нашли скрипты рядом (feed.mjs и
# posts.mjs), и раскладываем в assets/news в webp и avif.
#
# Имя файла собираем из даты записи и куска её адреса — так в папке видно, к
# какой новости относится кадр, и порядок совпадает с лентой.
#
# Первым идёт снимок с карточки ленты: на старом сайте именно он представлял
# новость в списке, у нас он же становится главным. Остальные уходят в полосу
# под текстом. Ширину режем до 640px: в ленте кадр занимает 232px, для экрана
# с двойной плотностью этого хватает с запасом, а открытый в новой вкладке
# файл остаётся смотрибельным.
import json
import os
import re
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "assets", "news")
RAW = os.path.join(HERE, "raw", "posts.json")
MAXW = 640
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

os.makedirs(OUT, exist_ok=True)
cache = os.path.join(HERE, "raw", "img")
os.makedirs(cache, exist_ok=True)


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return True
    try:
        request = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
    except Exception as error:  # noqa: BLE001 — печатаем и идём дальше
        print("  !", url, error)
        return False
    with open(path, "wb") as handle:
        handle.write(data)
    return True


def slug_of(post):
    """Короткое имя: дата задом наперёд плюс хвост адреса записи."""
    day, month, year = (post.get("cardDate") or "01.01.2020").split(".")
    tail = post["url"].rstrip("/").split("/")[-1]
    tail = re.sub(r"^[a-z0-9]+-", "", tail)          # у Tilda впереди её id
    tail = re.sub(r"[^a-z0-9-]", "", tail)[:28].strip("-")
    return "%s-%s-%s-%s" % (year, month, day, tail or "post")


def youtube_best(url):
    """У ролика вместо кадра берём обложку получше: 0.jpg — это 480x360."""
    match = re.search(r"/vi/([A-Za-z0-9_-]+)/", url)
    if not match:
        return [url]
    vid = match.group(1)
    return ["https://img.youtube.com/vi/%s/maxresdefault.jpg" % vid,
            "https://img.youtube.com/vi/%s/hqdefault.jpg" % vid,
            url]


posts = json.load(open(RAW, encoding="utf-8"))
index = {}

for feed, items in posts.items():
    for post in items:
        if post.get("external"):
            continue
        slug = slug_of(post)
        # Карточка первой, дальше остальные без повторов.
        urls = []
        for url in [post.get("cardImage") or ""] + post.get("pics", []):
            url = (url or "").split("?")[0]
            if url and url not in urls:
                urls.append(url)
        saved = []
        for number, url in enumerate(urls, 1):
            name = "%s-%d" % (slug, number)
            source = os.path.join(cache, name + os.path.splitext(url)[1][:5] or ".jpg")
            ok = False
            for candidate in (youtube_best(url) if "img.youtube.com" in url else [url]):
                if fetch(candidate, source):
                    ok = True
                    break
            if not ok:
                continue
            try:
                image = Image.open(source)
            except Exception as error:  # noqa: BLE001
                print("  !", name, error)
                continue
            if image.mode in ("RGBA", "LA", "P"):
                image = image.convert("RGBA")
                flat = Image.new("RGB", image.size, (255, 255, 255))
                flat.paste(image, mask=image.split()[-1])
                image = flat
            else:
                image = image.convert("RGB")
            if image.width > MAXW:
                image = image.resize(
                    (MAXW, round(image.height * MAXW / image.width)), Image.LANCZOS)
            webp = os.path.join(OUT, name + ".webp")
            avif = os.path.join(OUT, name + ".avif")
            image.save(webp, "WEBP", quality=80, method=6)
            image.save(avif, "AVIF", quality=54)
            saved.append({"name": name, "w": image.width, "h": image.height,
                          "kb_webp": round(os.path.getsize(webp) / 1024),
                          "kb_avif": round(os.path.getsize(avif) / 1024)})
        index.setdefault(feed, []).append({"url": post["url"], "slug": slug, "images": saved})
        print(feed, slug, len(saved), "кадр(ов)")

with open(os.path.join(HERE, "raw", "images.json"), "w", encoding="utf-8") as handle:
    json.dump(index, handle, ensure_ascii=False, indent=2)

total = sum(len(p["images"]) for feed in index.values() for p in feed)
weight = sum(i["kb_webp"] + i["kb_avif"] for feed in index.values()
             for p in feed for i in p["images"])
print("всего", total, "кадров,", round(weight / 1024, 1), "МБ в двух форматах")
