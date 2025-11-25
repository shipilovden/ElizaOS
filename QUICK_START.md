# 🚀 Быстрый старт: Деплой на Railway

## Шаг 1: Создайте GitHub репозиторий

### Вариант A: Через веб-интерфейс GitHub

1. Откройте https://github.com/new
2. Название: `ElizaOS` (или любое другое)
3. Выберите **Private**
4. **НЕ** добавляйте README, .gitignore, лицензию
5. Нажмите "Create repository"

### Вариант B: Через GitHub CLI (если установлен)

```bash
gh repo create ElizaOS --private --source=. --remote=origin --push
```

## Шаг 2: Подключите локальный репозиторий

```bash
cd C:\ElizaOS

# Добавьте remote (замените YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/ElizaOS.git

# Или через SSH:
# git remote add origin git@github.com:YOUR_USERNAME/ElizaOS.git
```

## Шаг 3: Закоммитьте и запушьте код

```bash
# Добавьте все файлы
git add .

# Создайте коммит
git commit -m "Initial commit: Metasiberian Agent"

# Переименуйте ветку в main
git branch -M main

# Запушьте в GitHub
git push -u origin main
```

## Шаг 4: Деплой на Railway

1. Зарегистрируйтесь на https://railway.app
2. Нажмите **"New Project"**
3. Выберите **"Deploy from GitHub repo"**
4. Авторизуйтесь через GitHub
5. Выберите репозиторий `ElizaOS`
6. Railway автоматически начнет деплой

## Шаг 5: Настройте переменные окружения

В Railway Dashboard:

1. Откройте ваш проект
2. Перейдите в **Variables**
3. Добавьте:

```
OPENAI_API_KEY=sk-dVAfNONRGf76I6PgCf4236B378E84c7dAcE993476509899d
NODE_ENV=production
```

4. Railway автоматически перезапустит проект

## Шаг 6: Настройте деплой (опционально)

Railway должен автоматически определить проект, но если нужно настроить вручную:

1. В Railway Dashboard → Settings → Service
2. Установите:
   - **Root Directory**: `metasiberian-agent`
   - **Start Command**: `bun run start`

## ✅ Готово!

После деплоя Railway предоставит URL:
`https://your-project.up.railway.app`

Проверьте:
- API: `https://your-project.up.railway.app/api/server/ping`
- Web UI: `https://your-project.up.railway.app`

## 🔧 Troubleshooting

### Railway не определяет проект автоматически

Создайте `Procfile` в корне `metasiberian-agent/`:

```
web: cd metasiberian-agent && bun run start
```

### Ошибки при деплое

Проверьте логи в Railway Dashboard → Deployments → View Logs

### WebSocket не работает

Railway поддерживает WebSocket автоматически, но убедитесь что:
- Используете HTTPS URL
- Порт настроен правильно (Railway автоматически назначает через `PORT`)

