"""Забирает фотографии таймлайна со старого сайта и кладёт их в assets/history.

Тильда отдаёт исходники в JPEG по 300–800 КБ и шириной под 1600 px — для полосы
времени это втрое больше нужного. Здесь они ужимаются до 900 px по ширине и
сохраняются парой avif + webp, как остальные снимки на сайте.
"""
import os
import subprocess
import sys

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://static.tildacdn.com/"
OUT = "../../assets/history"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# порядок — как на странице; имя файла у нас говорящее
ITEMS = [
    ("1995", "tild6461-3361-4561-a431-383564646532/__1.jpg"),
    ("1997", "tild6233-3636-4162-b664-663430623461/1997-3.jpg"),
    ("1999", "tild6633-6463-4464-b438-336436306630/1999-1.jpg"),
    ("2000", "tild6334-3737-4763-a138-333034356239/2000-1.jpg"),
    ("2001", "tild6330-3265-4462-a665-333663613163/2001-2.jpg"),
    ("2002", "tild3364-3332-4034-b538-373766626638/2002-1.jpg"),
    ("2003", "tild3962-3861-4163-a139-633432336564/2003-1.jpg"),
    ("2004", "tild3839-6164-4765-b136-623031613630/2004-1.jpg"),
    ("2005", "tild6263-3563-4835-b866-623334616562/2005-1.jpg"),
    ("2007", "tild3963-6164-4135-b461-393963356665/2007-1.jpg"),
    ("2008", "tild6562-6139-4933-b430-396438623061/2008-2.jpg"),
    ("2010", "tild3561-6230-4538-a131-306465323235/2010-11.jpg"),
    ("2011", "tild3761-3837-4665-b433-333866353833/2011-2.jpg"),
    ("2014", "tild3532-3131-4130-b864-666232353863/2014-1.jpg"),
    ("2015", "tild3232-3431-4733-b865-643333636464/2015-1.jpg"),
    ("2017", "tild6262-6635-4064-b433-383061386232/2017-1.jpg"),
    ("2019", "tild3831-3161-4662-a535-633765643138/2019-1.jpg"),
    ("2020", "tild3865-3937-4363-b336-366563653338/2020-1.jpg"),
    ("2022", "tild6334-6338-4637-a133-373334303337/FSSC_22000.jpg"),
    ("2023", "tild6631-6364-4661-a535-666432386135/19d8e6a038jpeg.jpg"),
    ("2024", "tild3430-3962-4161-b164-316366316566/5321027076435862219.jpg"),
]

os.makedirs(OUT, exist_ok=True)
os.makedirs("raw", exist_ok=True)

for year, path in ITEMS:
    raw = os.path.join("raw", year + ".jpg")
    if not os.path.exists(raw):
        code = subprocess.run(["curl", "-sS", "--max-time", "90", "-A", UA,
                               "-o", raw, BASE + path],
                              capture_output=True).returncode
        if code != 0:
            print("не скачалось:", year)
            continue
    im = Image.open(raw).convert("RGB")
    if im.width > 900:
        im = im.resize((900, round(im.height * 900 / im.width)), Image.LANCZOS)
    webp = os.path.join(OUT, year + ".webp")
    avif = os.path.join(OUT, year + ".avif")
    im.save(webp, "WEBP", quality=78, method=6)
    try:
        im.save(avif, "AVIF", quality=52)
    except Exception as err:
        print("  avif не вышел:", year, err)
    print("%s  %dx%d  webp %.0f КБ  avif %.0f КБ"
          % (year, im.width, im.height, os.path.getsize(webp) / 1024,
             os.path.getsize(avif) / 1024 if os.path.exists(avif) else 0))
