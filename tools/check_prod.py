"""Сверяет novoterskaya.ru с репозиторием — постранично.

Прод заливается руками, поэтому отстаёт по частям: одна страница свежая,
соседняя — с прошлого месяца. Глазами это не увидеть, а «на сайте старый текст»
может относиться к любому файлу. Скрипт скачивает каждую страницу и каждый JSON
с прода и сравнивает с версией репозитория, приведённой к проду теми же
поправками, что делает make_prod_files (адреса и имена кадров ленты) — то есть
сравнивает по существу, а не спотыкается на заведомо разных canonical.

Переводы строк при сравнении не учитываются: на хостинге лежат файлы и с LF, и
с CRLF (git отдаёт рабочей копии CRLF, а страницы, залитые давно, остались с
LF), и побайтовое сравнение объявило бы отставшими одиннадцать страниц, у
которых не отличается ни один символ текста.

Для JSON, если и после этого байты разошлись, проверяет ещё и равенство по
содержимому: файл мог быть сохранён с другими отступами, но означать то же самое.

    python tools/check_prod.py
"""

import glob
import io
import json
import urllib.error
import urllib.request

import make_prod_files

PROD = "https://novoterskaya.ru/"
TIMEOUT = 30


def fetch(path):
    with urllib.request.urlopen(PROD + path, timeout=TIMEOUT) as response:
        return response.read().decode("utf-8")


def local(name):
    with io.open(name, encoding="utf-8", newline="") as handle:
        return make_prod_files.to_prod(handle.read())


def lines(text):
    """Текст без разницы в переводах строк — сравнивать надо содержимое."""
    return text.replace("\r\n", "\n")


def compare(name):
    """Возвращает строку состояния: совпадает / отличается / недоступно."""
    path = name.replace("\\", "/")
    try:
        remote = fetch(path)
    except urllib.error.HTTPError as error:
        return "недоступно", f"{error.code} {error.reason}"
    except Exception as error:  # таймаут, обрыв, DNS
        return "недоступно", str(error)

    want = local(name)
    if lines(remote) == lines(want):
        return "совпадает", ""

    note = f"прод {len(remote)} байт, репозиторий {len(want)}"
    if path.endswith(".json"):
        try:
            if json.loads(remote) == json.loads(want):
                return "совпадает", "по содержимому, различия только в форматировании"
        except ValueError:
            note += ", и один из файлов не разбирается как JSON"
    return "отличается", note


def main():
    # Скрипты и стили важны не меньше страниц: поведение меню и подписей задаёт
    # js/cms.js, и отставший на проде скрипт свёл бы правку content/site.json к нулю.
    targets = (sorted(glob.glob("*.html")) + sorted(glob.glob("content/*.json"))
               + sorted(glob.glob("js/*.js")) + sorted(glob.glob("css/*.css")))
    groups = {"совпадает": [], "отличается": [], "недоступно": []}
    for name in targets:
        state, note = compare(name)
        groups[state].append((name, note))
        print(f"{name:26} {state}{'  — ' + note if note else ''}")

    print()
    print(f"итого: свежих {len(groups['совпадает'])}, "
          f"отстаёт {len(groups['отличается'])}, "
          f"недоступно {len(groups['недоступно'])}")
    if groups["отличается"]:
        print("залить на хостинг:", ", ".join(
            f"tools/prod-upload/{name}" for name, _ in groups["отличается"]))


if __name__ == "__main__":
    main()
