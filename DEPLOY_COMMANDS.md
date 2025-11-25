# Команды для деплоя на Railway

## Шаг 1: Создайте репозиторий на GitHub

1. Откройте: https://github.com/new
2. Repository name: `ElizaOS`
3. Выберите **Private**
4. **НЕ** добавляйте README, .gitignore, лицензию
5. Нажмите "Create repository"

## Шаг 2: Добавьте файлы и запушьте

```bash
cd C:\ElizaOS

# Добавьте все файлы
git add .

# Создайте коммит
git commit -m "Initial commit: Metasiberian Agent for Railway"

# Переименуйте ветку в main (если нужно)
git branch -M main

# Запушьте в GitHub
git push -u origin main
```

## Шаг 3: Деплой на Railway

1. Откройте: https://railway.app
2. Нажмите **"New Project"**
3. Выберите **"Deploy from GitHub repo"**
4. Авторизуйтесь через GitHub
5. Выберите репозиторий `shipilovden/ElizaOS`
6. Railway автоматически начнет деплой

## Шаг 4: Настройте переменные окружения

В Railway Dashboard → Variables добавьте:

```
OPENAI_API_KEY=sk-dVAfNONRGf76I6PgCf4236B378E84c7dAcE993476509899d
NODE_ENV=production
```

## Шаг 5: Настройте Root Directory (важно!)

В Railway Dashboard:
1. Откройте ваш сервис
2. Settings → Service
3. Установите **Root Directory**: `metasiberian-agent`
4. Railway автоматически перезапустит

## ✅ Готово!

Railway предоставит URL вида:
`https://your-project.up.railway.app`

Проверьте:
- API: `https://your-project.up.railway.app/api/server/ping`
- Web UI: `https://your-project.up.railway.app`

## 🔧 Если Railway не определяет проект

В Settings → Service установите:
- **Root Directory**: `metasiberian-agent`
- **Start Command**: `bun run start`

