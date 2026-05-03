// src/config.js
require('dotenv').config();

const isDevMode = process.env.NODE_ENV === 'development';

module.exports = {
  bot: {
    token: process.env.BOT_TOKEN,
    username: process.env.BOT_USERNAME || '',
  },
  trainer: {
    telegramIds: (process.env.TRAINER_TELEGRAM_IDS || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x)),
  },
  admin: {
    telegramIds: (process.env.ADMIN_TELEGRAM_IDS || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x)),
    webAppUrl: process.env.ADMIN_WEBAPP_URL || '',
    devBypass: String(process.env.ADMIN_DEV_BYPASS || '').toLowerCase() === 'true',
  },
  db: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: 'postgres',
    logging: isDevMode ? console.log : false,
  },
  gigachat: {
    clientId: process.env.GIGACHAT_CLIENT_ID,
    clientSecret: process.env.GIGACHAT_CLIENT_SECRET,
    scope: process.env.GIGACHAT_SCOPE,
  },
  server: {
    port: process.env.PORT || 3000,
  },
};
