# Управление контентом (CMS)

Сайт статический (GitHub Pages), но тексты продукции, документов и контактов
можно менять без программиста — через админку на базе **Sveltia CMS**
(совместима с Decap CMS).

## Что можно редактировать

Админка правит JSON-файлы в папке `content/`:

| Файл | Что содержит |
|------|--------------|
| `content/products.json`   | Карточки продукции (название, тип, фото) |
| `content/documents.json`  | Сертификаты и документы (название, описание, PDF/скан) |
| `content/contacts.json`   | Контакты завода и дистрибьюторов |

После сохранения админка делает коммит в репозиторий `StepanCEO/Novoterskiy`,
а GitHub Pages публикует изменения автоматически (обычно за 1–2 минуты).
Пересборка не требуется — на сайте `js/cms.js` подтягивает свежий JSON.

Если JSON почему-то недоступен, на странице остаётся вёрстка по умолчанию —
сайт не «сломается».

## Как войти в админку

Адрес: `https://<ваш-домен>/admin/` (например
`https://stepanceo.github.io/Novoterskiy/admin/`).

## Разовая настройка входа (делает владелец один раз)

Чтобы админка могла коммитить в GitHub, нужен OAuth-мост. Самый простой путь —
бесплатный сервис **Sveltia CMS Authenticator** на Cloudflare Workers:

1. Создайте **GitHub OAuth App**:
   `Settings → Developer settings → OAuth Apps → New OAuth App`.
   - Homepage URL: адрес сайта.
   - Authorization callback URL: URL вашего auth-воркера (см. шаг 2).
   Запишите **Client ID** и **Client Secret**.
2. Разверните авторизатор по инструкции
   <https://github.com/sveltia/sveltia-cms-auth> (кнопка Deploy to Cloudflare),
   указав Client ID и Secret в переменных окружения.
3. Пропишите адрес воркера в `admin/config.yml`, добавив в блок `backend`:
   ```yaml
   backend:
     name: github
     repo: StepanCEO/Novoterskiy
     branch: main
     base_url: https://<ваш-воркер>.workers.dev
   ```
4. Дайте нужным людям доступ к репозиторию (write) — под их GitHub-логином
   они смогут входить в админку.

> Альтернатива без своего воркера: подключить репозиторий к
> **Netlify** и использовать его встроенный Git Gateway / Identity —
> тогда `backend.name` меняется на `git-gateway`.

Это единственный шаг, который нельзя автоматизировать из кода:
он требует создания OAuth-приложения в аккаунте владельца.
