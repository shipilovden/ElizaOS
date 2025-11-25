# Деплой Metasiberian Agent на Railway.app

## 🚀 Быстрый старт

### 1. Создайте репозиторий на GitHub

```bash
# Добавьте remote (замените YOUR_USERNAME на ваш GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/ElizaOS.git

# Добавьте все файлы
git add .

# Создайте первый коммит
git commit -m "Initial commit: Metasiberian Agent"

# Запушьте в GitHub
git branch -M main
git push -u origin main
```

### 2. Деплой на Railway

1. Зарегистрируйтесь на https://railway.app
2. Нажмите "New Project" → "Deploy from GitHub repo"
3. Выберите ваш репозиторий `ElizaOS`
4. Railway автоматически определит проект

### 3. Настройка переменных окружения

В Railway Dashboard → Variables добавьте:

**Обязательные:**
- `OPENAI_API_KEY` = `sk-dVAfNONRGf76I6PgCf4236B378E84c7dAcE993476509899d`
- `NODE_ENV` = `production`

**Опциональные:**
- `POSTGRES_URL` - если хотите использовать PostgreSQL вместо PGLite
- `LOG_LEVEL` = `info`
- `SERVER_PORT` = `3000` (Railway автоматически назначит порт)

### 4. Настройка деплоя

Railway автоматически:
- Определит что это Node.js проект
- Установит зависимости через `bun install`
- Запустит через `bun run start`

Если нужно настроить вручную, создайте `railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "bun install && bun run build"
  },
  "deploy": {
    "startCommand": "cd metasiberian-agent && bun run start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 5. Проверка работы

После деплоя Railway предоставит URL вида:
`https://your-project.up.railway.app`

Проверьте:
- API: `https://your-project.up.railway.app/api/server/ping`
- Web UI: `https://your-project.up.railway.app`

## ✅ Преимущества Railway

- ✅ Поддержка WebSocket (Socket.IO работает)
- ✅ Постоянные соединения
- ✅ Автоматический деплой из Git
- ✅ Простое управление переменными окружения
- ✅ Логи в реальном времени
- ✅ Бесплатный план доступен

## 📝 Примечания

- Railway автоматически назначает порт через переменную `PORT`
- Все данные хранятся в `/tmp` (эфемерная файловая система)
- Для постоянного хранения используйте PostgreSQL через `POSTGRES_URL`

## 🔗 Полезные ссылки

- Railway Docs: https://docs.railway.app
- ElizaOS Docs: https://docs.elizaos.ai

