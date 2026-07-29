"""Контактный лист: посмотреть, что на самом деле лежит в скачанных снимках."""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

SRC = "../../assets/history"
CELL = 300
COLS = 6
font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 26)

names = sorted(f for f in os.listdir(SRC) if f.endswith(".webp"))
rows = (len(names) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * CELL, rows * (CELL + 34)), (24, 28, 34))
draw = ImageDraw.Draw(sheet)

for i, name in enumerate(names):
    im = Image.open(os.path.join(SRC, name)).convert("RGB")
    im.thumbnail((CELL - 8, CELL - 8), Image.LANCZOS)
    x = (i % COLS) * CELL
    y = (i // COLS) * (CELL + 34)
    sheet.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2))
    draw.text((x + 8, y + CELL + 2), name[:-5], font=font, fill=(235, 240, 246))

sheet.save("sheet.jpg", quality=86)
print("готово:", sheet.size)
