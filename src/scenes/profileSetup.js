// src/scenes/profileSetup.js
const { Scenes } = require('telegraf');
const { User } = require('../models/associations');
const userMiddleware = require('../middleware/sceneUserMiddleware');

const profileSetupScene = new Scenes.WizardScene(
  'PROFILE_SETUP_SCENE',

  // Шаг 3: Выбор платформ
  async (ctx) => {
    let platformPreferences = {};

    if (ctx.message.text === '/telegram') {
      platformPreferences = { telegram: true, vkontakte: false };
    } else if (ctx.message.text === '/vkontakte') {
      platformPreferences = { telegram: false, vkontakte: true };
    } else if (ctx.message.text === '/both') {
      platformPreferences = { telegram: true, vkontakte: true };
    } else {
      await ctx.reply(
        '❌ Пожалуйста, выбери платформу используя команды:\n/telegram /vkontakte /both'
      );
      return;
    }

    // Сохраняем настройки пользователя
    await User.update(
      {
        // email: ctx.wizard.state.email,
        platformPreferences: platformPreferences,
      },
      { where: { telegramId: ctx.from.id } }
    );

    // TODO: добавить оторажение текущего тарифа

    await ctx.reply(
      `🎉 Отлично! Настройка завершена!\n\n📧 📱 Платформы: ${Object.keys(platformPreferences)
        .filter((p) => platformPreferences[p])
        .join(', ')}\n\nТеперь используй /setup_voice чтобы настроить "голос автора"`
    );

    return ctx.scene.leave();
  }
);

module.exports = profileSetupScene;
