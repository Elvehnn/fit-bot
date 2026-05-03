// src/models/database.js
const { Sequelize } = require('sequelize');
const config = require('../config');

const sequelize = new Sequelize(config.db);

// Тестируем подключение
sequelize.authenticate()
  .then(() => console.log('✅ PostgreSQL подключена успешно'))
  .catch(err => console.error('❌ Ошибка подключения к PostgreSQL:', err));

module.exports = sequelize;