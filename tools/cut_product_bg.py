"""Вырезает студийный фон у фотографий упаковки и пишет webp с альфой.

Съёмка у завода одинаковая: белый или светло-серый циклорама-фон, мягкая тень
под предметом. Простой color-key на такой картинке съедает светлые блики на
плёнке и оставляет тень, поэтому маска строится так же, как у знаков КМВ, —
по форме (крупные связные компоненты + заливка дыр), а мягкий край берётся
только в узкой полосе вокруг формы.

Отличие от cut_logo_bg.py: фон здесь не идеально ровный (градиент циклорамы),
поэтому цвет фона берётся медианой по рамке кадра, а не задаётся константой.
Тень отсекается порогом: у бутылок контраст с фоном 40+, у тени — меньше 25.

Кадры, снятые не на заводской съёмке, этим способом не берутся вовсе — для них
есть MATTE_JOBS и rembg, подробности в комментарии к списку.

Готовые файлы кладутся в assets/products/ с высотой 815 px — так же, как уже
лежащие карточки, иначе в сетке каталога бутылки поедут по размеру.

    python tools/cut_product_bg.py
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

OUT_DIR = "assets/products"
OUT_HEIGHT = 815       # высота карточки в каталоге, как у уже готовых бутылок
OUT_MAX_WIDTH = 900    # групповые кадры шире бутылки — дальше растить незачем
PAD = 8                # поля вокруг вырезанной формы, px исходника
MIN_PART = 0.0015      # компонент меньше 0.15% кадра — блик на полу или пыль
FEATHER = 14           # ширина полосы мягкого края вокруг формы, px исходника
BORDER = 24            # толщина рамки, по которой считается цвет фона

SRC = "tools/_pack/ФОТО упаковки"
FIVE = "tools/_pack/5l/tg"
TG = "tools/_pack/tg"

# (исходник, имя в assets/products, порог формы, порог мягкого края)
#
# Пороги подобраны по кадрам: у одиночной бутылки стекло тёмное и порог держим
# высоким, чтобы не втянуть тень; у групповых кадров предмет обёрнут в плёнку,
# её край почти сливается с фоном — порог ниже, иначе от упаковки остаются рваные
# края.
# Кадры в присланном архиве дублируются: папка «ВСЁ» — те же файлы под
# номерами с камеры. Здесь перечислены только уникальные снимки.
JOBS = [
    # Целебная 1 л, ПЭТ
    (f"{SRC}/МВ 1л.PNG", "celebnaya-pet-1", 34, 14),
    # Второй кадр той же бутылки: на главном она повёрнута боком этикетки, с
    # составом, а здесь стоит лицом — с названием воды и знаком КМВ.
    (f"{SRC}/ВСЁ/1л_2837.png", "celebnaya-pet-1-4", 34, 14),
    # У шестёрки 1 л слева на фоне лежит длинная мягкая тень; при пороге 26
    # она попадала в форму и висела на карточке серым пятном.
    (f"{SRC}/МВ 1л уп..JPG", "celebnaya-pet-1-2", 40, 18),
    (f"{SRC}/Три бут_.JPG", "celebnaya-pet-1-3", 30, 12),
    # Целебная 0,5 л, ПЭТ — контрэтикетка. В архиве кадр подписан «ПВ», то есть
    # питьевая, но на нём бирюзовая бутылка целебной; кладём к ней.
    (f"{SRC}/ПВ 0,5 ПЭТ контр.эт.png", "celebnaya-pet-05-8", 34, 14),
    # Целебная 0,5 л, стекло «Элита» — короб на 12 бутылок. Рядом в галерее
    # лежит такой же короб «Евро»; бутылки в них разной формы.
    (f"{SRC}/Элита уп..png", "celebnaya-glass-elita-05-7", 30, 12),
    # Питьевая 1,5 л, газированная
    (f"{SRC}/ПВ 1,5л газ уп.JPG", "pityevaya-pet-15-gas-2", 26, 11),
    # Питьевая 1,5 л, негазированная
    (f"{SRC}/ПВ  1,5л НГ уп.JPG", "pityevaya-pet-15", 26, 11),
    # Целебная 0,5 л, стекло «Евро»
    (f"{SRC}/Евро уп. .jpg", "celebnaya-glass-euro-05", 30, 12),
    # Питьевая 5 л, ПЭТ. Кадры пришли отдельно и мельче остальных (960 px), но
    # фон тот же светло-серый, так что пороги работают как на большой съёмке.
    # У бутылки почти вся форма — прозрачный пластик, и порог приходится
    # держать низким, иначе от боков остаются только рёбра.
    (f"{FIVE}/b.jpg", "pityevaya-pet-5", 18, 7),
    (f"{FIVE}/a.jpg", "pityevaya-pet-5-2", 26, 11),
    (f"{FIVE}/c.jpg", "pityevaya-pet-5-3", 26, 11),
]

# Кадры, снятые не на заводской циклораме. Здесь фон уходит градиентом (у
# присланной бутылки 1,5 л — от 202 слева до 100 справа), и медиана по рамке
# больше ничего не описывает. Хуже того, прозрачный корпус по яркости совпадает
# с фоном за ним: расхождение внутри бутылки — 5.6, разброс самого фона — 7.5,
# разделить их порогом нельзя ни при каком значении. Такие снимки матует
# нейросеть (rembg, U^2-Net), она отделяет предмет по форме, а не по цвету.
MATTE_JOBS = [
    # Одиночная бутылка 1,5 л газированной: заказчик прислал её отдельно и
    # попросил показывать первой.
    (f"{TG}/pv-15-gas-bottle.jpg", "pityevaya-pet-15-gas"),
]

# Уровни для таких кадров. Одной маски мало: сквозь прозрачный корпус видна
# циклорама, и вместе с ней в вырезку переезжает её цвет — бутылка выходит
# серой и плоской рядом со студийными. Поэтому кадр делится на модель фона:
# деление разом убирает и градиент, и тёплый оттенок, а у прозрачных пикселей
# оставляет то, что и нужно, — долю пропущенного света.
#
# Дальше доля растягивается в яркость. Границы взяты по гистограмме студийных
# бутылок каталога (10/50/90 перцентили — 110/204/214): при этих числах новая
# бутылка даёт 167/198/221 и в ряду не выбивается. Поднимать белую точку выше
# нельзя — корпус уходит в пересвет и теряет рёбра.
MATTE_BLACK = 0.35   # доля от фона, ниже которой пиксель считается чёрным
MATTE_WHITE = 1.03   # доля, выше которой — белым
MATTE_PEAK = 222     # яркость этого белого

# Затравка для модели фона: поля кадра, где предмета заведомо нет. Дальше
# область уточняется — всё, что легло на модель, тоже признаётся фоном.
MATTE_MARGINS = (0.22, 0.20, 0.12)   # слева, справа, сверху — доли кадра
MATTE_TOLERANCE = 12                 # отклонение от модели, ещё считающееся фоном


def background_surface(rgb):
    """Фон как гладкая поверхность: кубический полином по каждому каналу.

    Медиана по рамке описывает только ровный фон. Здесь свет падает сбоку, и
    циклорама уходит с 202 слева до 100 справа — одним числом это не задать.
    """
    height, width, _ = rgb.shape
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    ys /= height
    xs /= width
    terms = np.stack([np.ones_like(xs), xs, ys, xs * xs, xs * ys, ys * ys,
                      xs ** 3, xs * xs * ys, xs * ys * ys, ys ** 3], axis=-1)
    flat = terms.reshape(-1, terms.shape[-1])

    left, right, top = MATTE_MARGINS
    seed = np.zeros((height, width), bool)
    seed[:, :int(width * left)] = True
    seed[:, int(width * (1 - right)):] = True
    seed[:int(height * top)] = True

    surface = None
    for _ in range(4):
        coefficients = np.linalg.lstsq(terms[seed], rgb[seed], rcond=None)[0]
        surface = (flat @ coefficients).reshape(rgb.shape)
        seed = np.abs(rgb - surface).max(axis=2) < MATTE_TOLERANCE
    return surface


def background_color(rgb):
    """Медиана по рамке кадра: устойчива к попавшему в край предмету."""
    ring = np.concatenate([
        rgb[:BORDER].reshape(-1, 3),
        rgb[-BORDER:].reshape(-1, 3),
        rgb[:, :BORDER].reshape(-1, 3),
        rgb[:, -BORDER:].reshape(-1, 3),
    ])
    return np.median(ring, axis=0)


def cut(path, name, shape_threshold, edge_threshold):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    bg = background_color(rgb)
    diff = np.abs(rgb - bg).max(axis=2)

    # 1. Форма: крупные связные компоненты, дыры внутри залиты. Замыкание
    #    склеивает разрывы на прозрачной плёнке, иначе упаковка распадается
    #    на отдельные бутылки и половина краёв уходит в фон.
    solid = ndimage.binary_closing(diff > shape_threshold, np.ones((9, 9)))
    labels, count = ndimage.label(solid)
    if not count:
        raise SystemExit(f"{path}: фон не отделился, поднимите порог")
    sizes = ndimage.sum(np.ones_like(labels), labels, range(1, count + 1))
    keep = np.zeros(count + 1, dtype=bool)
    keep[1:] = sizes >= MIN_PART * diff.size
    shape = ndimage.binary_fill_holes(keep[labels])

    # 2. Мягкий край — только рядом с формой.
    near = ndimage.binary_dilation(shape, iterations=FEATHER)
    soft = np.clip((diff - edge_threshold) / max(shape_threshold - edge_threshold, 1), 0, 1)
    alpha = np.where(shape, 1.0, soft * near)

    # 3. Снимаем подмешанный фон с полупрозрачных пикселей, иначе по контуру
    #    бутылки остаётся белёсая кайма поверх светлой страницы.
    a = alpha[..., None]
    edge = (~shape)[..., None] & (a > 0)
    unmixed = (rgb - bg * (1 - a)) / np.maximum(a, 1e-3)
    out_rgb = np.where(edge, np.clip(unmixed, 0, 255), rgb)

    image = Image.fromarray(
        np.dstack([out_rgb, alpha * 255]).round().clip(0, 255).astype(np.uint8), "RGBA")
    return finish(image, name)


def matte(path, name):
    """То же самое, но маску даёт rembg, а тон выправляется по модели фона."""
    import rembg  # тяжёлая зависимость, нужна ровно одному снимку

    source = Image.open(path).convert("RGB")
    alpha = np.asarray(rembg.remove(source))[..., 3].astype(np.float32) / 255

    rgb = np.asarray(source).astype(np.float32)
    share = rgb / np.maximum(background_surface(rgb), 1)
    out_rgb = np.clip((share - MATTE_BLACK) / (MATTE_WHITE - MATTE_BLACK), 0, 1) * MATTE_PEAK

    image = Image.fromarray(
        np.dstack([out_rgb, alpha * 255]).round().clip(0, 255).astype(np.uint8), "RGBA")
    return finish(image, name)


def finish(image, name):
    """Обрезает пустоту, приводит к высоте карточки и пишет webp."""
    box = image.getbbox()
    if box:
        left, top, right, bottom = box
        image = image.crop((max(left - PAD, 0), max(top - PAD, 0),
                            min(right + PAD, image.width), min(bottom + PAD, image.height)))
    scale = OUT_HEIGHT / image.height
    if image.width * scale > OUT_MAX_WIDTH:
        scale = OUT_MAX_WIDTH / image.width
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)

    target = os.path.join(OUT_DIR, name + ".webp")
    image.save(target, "WEBP", quality=90, method=6, exact=True)
    return target, image.size


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for path, name, shape_threshold, edge_threshold in JOBS:
        target, size = cut(path, name, shape_threshold, edge_threshold)
        print(f"{target}  {size[0]}x{size[1]}")
    for path, name in MATTE_JOBS:
        target, size = matte(path, name)
        print(f"{target}  {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
