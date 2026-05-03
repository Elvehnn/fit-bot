// src/models/initDB.js
const sequelize = require('./database');
const { User, UserQuestionnaire, Trainer, TrainerInvite } = require('./associations');

const initDatabase = async () => {
  try {
    // Для разработки - alter, для продакшена лучше использовать миграции
    if (process.env.NODE_ENV === 'development') {
      await Trainer.sync({ alter: process.env.NODE_ENV === 'development' });
      console.log('✅ Таблица trainers синхронизирована');

      await User.sync({ alter: process.env.NODE_ENV === 'development' });
      console.log('✅ Таблица users синхронизирована');

      await UserQuestionnaire.sync({ alter: process.env.NODE_ENV === 'development' });
      console.log('✅ Таблица userquestionnaires синхронизирована');

      await TrainerInvite.sync({ alter: process.env.NODE_ENV === 'development' });
      console.log('✅ Таблица trainer_invites синхронизирована');

      // await sequelize.sync({ alter: true });
      console.log('✅ База данных инициализирована (alter mode)');
    } else {
      await sequelize.sync();
      console.log('✅ База данных инициализирована (safe mode)');
    }
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error);
  }
};

module.exports = initDatabase;
