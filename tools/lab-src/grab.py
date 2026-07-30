"""Забирает снимки лаборатории со старого сайта и кладёт их в assets/lab.

Тильда отдаёт исходники в JPEG шириной до 1700 px и весом под мегабайт — для
галереи на 2–3 карточки в кадре это втрое больше нужного. Здесь кадры
ужимаются до 900 px по ширине и сохраняются парой avif + webp, как остальные
фотографии на сайте. Мельче исходника не увеличиваем: у IMG_5542 своя ширина
567 px, растянуть её значило бы получить мыло.
"""
import os
import subprocess
import sys

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://static.tildacdn.com/"
OUT = "../../assets/lab"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# имя файла у нас говорящее, порядок — как в галерее на странице.
# Третье число — куда тянуть кадр при обрезке под 3:2 (0 — вверх, 1 — вниз);
# None значит «не трогать», такой снимок в галерею не идёт.
ITEMS = [
    ("lab-1", "tild3363-3836-4431-b237-643235643762/0123.jpg", 0.5),
    ("lab-2", "tild6339-3538-4039-b466-633138366466/IMG_3326.JPG", 0.5),
    # Единственный вертикальный кадр. Обрезаем ближе к верху: там переливают
    # воду из стакана в цилиндр, а нижняя треть — только руки и пустой штатив.
    ("lab-3", "tild6338-3136-4430-b734-313732343036/DSC_5953.jpg", 0.15),
    ("lab-4", "tild3465-3364-4165-b634-353632343532/IMG_5542.jpg", 0.5),
    # Крупный план лазерной маркировки на бутылке — иллюстрация к разделу
    # «Защита качества»: на нём читаются буквы КМВ, дата розлива, смена и время.
    # Кадр круглый, живёт отдельно от галереи, поэтому пропорции не трогаем.
    ("marking", "tild6339-3061-4334-b563-653531313361/1.png", None),
]
RATIO = 3 / 2  # общая пропорция карточек в галерее

os.makedirs(OUT, exist_ok=True)
os.makedirs("raw", exist_ok=True)

for name, path, anchor in ITEMS:
    ext = ".png" if path.endswith(".png") else ".jpg"
    raw = os.path.join("raw", name + ext)
    if not os.path.exists(raw):
        code = subprocess.run(["curl", "-sS", "--max-time", "90", "-A", UA,
                               "-o", raw, BASE + path],
                              capture_output=True).returncode
        if code != 0:
            print("не скачалось:", name)
            continue
    im = Image.open(raw)
    # У маркировки прозрачный фон по краям круга. Кладём её на белое: в карточке
    # под ней всё равно белая подложка, а webp с альфой весит заметно больше.
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        flat = Image.new("RGB", im.size, (255, 255, 255))
        flat.paste(im, mask=im.split()[-1])
        im = flat
    else:
        im = im.convert("RGB")
    # Приводим галерейные снимки к одной пропорции здесь, а не object-fit в CSS:
    # так у карточек одинаковая высота, а какой кусок кадра остаётся — решаем мы.
    if anchor is not None:
        if im.width / im.height > RATIO:
            keep = round(im.height * RATIO)
            left = round((im.width - keep) * 0.5)
            im = im.crop((left, 0, left + keep, im.height))
        elif im.width / im.height < RATIO:
            keep = round(im.width / RATIO)
            top = round((im.height - keep) * anchor)
            im = im.crop((0, top, im.width, top + keep))
    if im.width > 900:
        im = im.resize((900, round(im.height * 900 / im.width)), Image.LANCZOS)
    webp = os.path.join(OUT, name + ".webp")
    avif = os.path.join(OUT, name + ".avif")
    im.save(webp, "WEBP", quality=80, method=6)
    try:
        im.save(avif, "AVIF", quality=54)
    except Exception as err:
        print("  avif не вышел:", name, err)
    print("%-8s %dx%d  webp %.0f КБ  avif %.0f КБ"
          % (name, im.width, im.height, os.path.getsize(webp) / 1024,
             os.path.getsize(avif) / 1024 if os.path.exists(avif) else 0))
