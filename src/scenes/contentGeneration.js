// src/scenes/contentGeneration.js
const { Scenes } = require('telegraf');
const sceneUserMiddleware = require('../middleware/sceneUserMiddleware');
const advancedContentGenerator = require('../utils/advancedContentGenerator');
const {
  showMainMenu,
  showContentGenerationMenu,
  showBackToContentMenu,
  showPostTopicRequest,
  getPlatformName,
} = require('../utils/keyboardHelpers');

const contentGenerationScene = new Scenes.WizardScene(
  'CONTENT_GENERATION_SCENE',

  // Шаг 1: Выбор типа контента
  async (ctx) => {
    console.log('🎯 Сцена CONTENT_GENERATION_SCENE: Шаг 1');

    await sceneUserMiddleware(ctx, async () => {});

    const choice = ctx.message?.text;

    console.log('Выбор пользователя:', choice);

    // Обработка кнопок из меню действий
    if (choice === '🔄 Сгенерировать пост') {
      // Проверяем количество выбранных платформ
      const activePlatforms = getActivePlatforms(ctx.user.platformPreferences);

      if (activePlatforms.length > 1) {
        await showPlatformSelection(ctx);
        ctx.wizard.state.generationType = 'another_post';

        return ctx.wizard.selectStep(2); // Переходим к выбору платформы
      } else {
        // Если одна платформа - сразу запрашиваем тему
        const platform = activePlatforms[0] || 'telegram';
        ctx.wizard.state.selectedPlatform = platform;
        await showPostTopicRequest(ctx, platform);

        return ctx.wizard.selectStep(3); // Переходим к вводу темы
      }
    } else if (choice === '💡 Сгенерировать идеи') {
      await generateIdeasAndShowActions(ctx);

      return; // Остаемся на текущем шаге
    } else if (choice === '🎯 Главное меню') {
      await showMainMenu(ctx);

      return ctx.scene.leave();
    }

    if (choice === 'Назад') {
      await showMainMenu(ctx, '🎯 Выбери действие:');
      return ctx.scene.leave();
    }

    await ctx.reply('🎨 Выбери тип контента:', {
      reply_markup: {
        keyboard: [['🚀 Быстрая идея', '📄 Полный пост', 'Назад']],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });

    return ctx.wizard.next();
  },

  // Шаг 2: Обработка выбора типа контента
  async (ctx) => {
    console.log('🎯 Сцена CONTENT_GENERATION_SCENE: Шаг 2');

    await sceneUserMiddleware(ctx, async () => {});

    const choice = ctx.message?.text;
    console.log('Выбор пользователя:', choice);

    // Обработка кнопок из меню действий
    if (choice === '🔄 Сгенерировать пост') {
      const activePlatforms = getActivePlatforms(ctx.user.platformPreferences);

      if (activePlatforms.length > 1) {
        await showPlatformSelection(ctx);
        ctx.wizard.state.generationType = 'another_post';

        return ctx.wizard.next(); // Переходим к выбору платформы
      } else {
        const platform = activePlatforms[0] || 'telegram';
        ctx.wizard.state.selectedPlatform = platform;
        await showPostTopicRequest(ctx, platform);

        return ctx.wizard.selectStep(3); // Переходим к вводу темы
      }
    } else if (choice === '💡 Сгенерировать идеи') {
      await generateIdeasAndShowActions(ctx);

      return; // Остаемся на текущем шаге
    } else if (choice === '🎯 Главное меню') {
      await showMainMenu(ctx);

      return ctx.scene.leave();
    }

    if (choice === '🚀 Быстрая идея') {
      await generateIdeasAndShowActions(ctx);
    } else if (choice === '📄 Полный пост') {
      // Проверяем количество выбранных платформ
      const activePlatforms = getActivePlatforms(ctx.user.platformPreferences);

      if (activePlatforms.length > 1) {
        await showPlatformSelection(ctx);
        ctx.wizard.state.generationType = 'full_post';

        return ctx.wizard.next(); // Переходим к выбору платформы
      } else {
        // Если одна платформа - сразу запрашиваем тему
        const platform = activePlatforms[0] || 'telegram';
        ctx.wizard.state.selectedPlatform = platform;
        await showPostTopicRequest(ctx, platform);
        return ctx.wizard.next(); // Переходим к вводу темы
      }
    } else if (choice === 'Назад') {
      await showMainMenu(ctx);
      return ctx.scene.leave();
    } else {
      await ctx.reply('❌ Пожалуйста, выбери вариант из кнопок');
      return;
    }
  },

  // Шаг 3: Выбор платформы (только если несколько активных платформ)
  async (ctx) => {
    console.log('🎯 Сцена CONTENT_GENERATION_SCENE: Шаг 3 - Выбор платформы');

    await sceneUserMiddleware(ctx, async () => {});

    const platformChoice = ctx.message?.text;
    console.log('platformChoice', platformChoice);
    const activePlatforms = getActivePlatforms(ctx.user.platformPreferences);
    console.log('activePlatforms', activePlatforms);

    // НЕЧУВСТВИТЕЛЬНАЯ К РЕГИСТРУ ПРОВЕРКА
    const normalizedChoice = platformChoice?.toLowerCase();
    const isPlatformActive = activePlatforms.some(
      (platform) => platform.toLowerCase() === normalizedChoice
    );

    // Проверяем, что выбранная платформа активна
    if (platformChoice && isPlatformActive) {
      // Находим точное значение платформы из активных
      const exactPlatform = activePlatforms.find(
        (platform) => platform.toLowerCase() === normalizedChoice
      );

      ctx.wizard.state.selectedPlatform = exactPlatform;

      const generationType = ctx.wizard.state.generationType;

      if (generationType === 'full_post' || generationType === 'another_post') {
        await showPostTopicRequest(ctx, exactPlatform);
        return ctx.wizard.next(); // Переходим к вводу темы
      }
    } else if (platformChoice === 'Назад') {
      await showBackToContentMenu(ctx);
      return ctx.wizard.selectStep(0);
    } else {
      await ctx.reply('❌ Пожалуйста, выбери платформу из списка');
      return;
    }
  },

  // Шаг 4: Полноценный пост (ввод темы и генерация)
  async (ctx) => {
    console.log('🎯 Сцена CONTENT_GENERATION_SCENE: Шаг 4 - Генерация поста');

    await sceneUserMiddleware(ctx, async () => {});

    const userInput = ctx.message?.text;
    const selectedPlatform = ctx.wizard.state.selectedPlatform || 'telegram';

    // Обработка кнопок из меню действий
    if (userInput === '🔄 Сгенерировать пост') {
      const activePlatforms = getActivePlatforms(ctx.user.platformPreferences);

      if (activePlatforms.length > 1) {
        await showPlatformSelection(ctx);
        ctx.wizard.state.generationType = 'another_post';

        return ctx.wizard.selectStep(2); // Переходим к выбору платформы
      } else {
        const platform = activePlatforms[0] || 'telegram';
        ctx.wizard.state.selectedPlatform = platform;
        await showPostTopicRequest(ctx, platform);

        return; // Остаемся на этом же шаге
      }
    } else if (userInput === '💡 Сгенерировать идеи') {
      await generateIdeasAndShowActions(ctx);

      return; // Остаемся на этом же шаге
    } else if (userInput === '🎯 Главное меню') {
      await showMainMenu(ctx);
      return ctx.scene.leave();
    }

    if (!userInput) {
      await ctx.reply('❌ Пожалуйста, введите запрос');
      return;
    }

    if (userInput === '/idea') {
      await generateIdeasAndShowActions(ctx);
      return; // Остаемся на этом же шаге
    }

    // Обработка кнопки "Назад"
    if (userInput === '🔙 Назад к выбору контента') {
      await showBackToContentMenu(ctx);
      return ctx.wizard.selectStep(0);
    }

    await ctx.reply(
      `📝 Генерирую полноценный пост для ${getPlatformName(selectedPlatform)} по запросу: "${userInput}"...`
    );

    try {
      const post = await advancedContentGenerator.generatePost(
        userInput,
        ctx.user.firstName,
        selectedPlatform,
        ctx.user.authorVoice,
        undefined,
        ctx.user.id,
        1
      );

      await ctx.reply(`📱 Пост для ${getPlatformName(selectedPlatform)}:\n\n${post}`);

      // ПОСЛЕ УСПЕШНОЙ ГЕНЕРАЦИИ ПОСТА - ПРЕДЛАГАЕМ ДАЛЬНЕЙШИЕ ДЕЙСТВИЯ
      await showPostActionsMenu(ctx, '✅ Пост готов! Что дальше?');

      // Выходим из сцены, но оставляем меню активным
      return ctx.scene.leave();
    } catch (error) {
      if (error.message.includes('Лимит бесплатных генераций')) {
        const message = `😢 Жаль прерываться!

На этой неделе вы создали несколько черновиков — это отличный старт! Мы видим, что вы активно работаете над своим контентом.

Для таких продуктивных авторов, как вы, у нас есть специальный стартовый пакет:

🎁 «Первый блин» — 25 генераций за 250 руб.
(Доступен только один раз).`;

        await ctx.reply(message, {
          reply_markup: {
            keyboard: [
              [{ text: '🎁 Купить «Первый блин»' }, { text: '❓ Посмотреть все тарифы' }],
              [{ text: '🎯 Главное меню' }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      } else {
        console.error('Ошибка генерации поста:', error);
        await ctx.reply('❌ Произошла ошибка при генерации поста. Попробуйте позже.');
        await showPostActionsMenu(ctx, '❌ Что будем делать дальше?');
      }
    }

    return ctx.scene.leave();
  }
);

// ФУНКЦИЯ: Получение активных платформ
function getActivePlatforms(platformPreferences) {
  if (!platformPreferences) return ['telegram'];

  return Object.keys(platformPreferences).filter(
    (platform) => platformPreferences[platform] === true
  );
}

// ФУНКЦИЯ: Отображение выбора платформы
async function showPlatformSelection(ctx) {
  const activePlatforms = getActivePlatforms(ctx.user.platformPreferences);
  const platformButtons = activePlatforms.map((platform) => [getPlatformName(platform)]);
  platformButtons.push(['Назад']);

  await ctx.reply('📱 Для какой платформы генерируем контент?', {
    reply_markup: {
      keyboard: platformButtons,
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

// ФУНКЦИЯ: Генерация идей с показом меню действий
async function generateIdeasAndShowActions(ctx) {
  await ctx.reply('💡 Генерирую креативные идеи...');

  try {
    const platformPreferences = ctx.user.platformPreferences || {};
    const activePlatform = getActivePlatforms(platformPreferences)[0] || 'telegram';

    const ideas = await advancedContentGenerator.generateIdea(
      ctx.user.authorVoice,
      activePlatform,
      3
    );

    await ctx.reply(ideas);
    await showPostActionsMenu(ctx, '✨ Идеи готовы! Что дальше?');
  } catch (error) {
    console.error('Ошибка генерации идей:', error);
    await ctx.reply('❌ Произошла ошибка при генерации идей.');
    await showPostActionsMenu(ctx);
  }
}

// ФУНКЦИЯ: Меню действий после генерации
async function showPostActionsMenu(ctx, message = '✅ Пост готов! Что дальше?') {
  await ctx.reply(message, {
    reply_markup: {
      keyboard: [
        [{ text: '🔄 Сгенерировать пост' }, { text: '💡 Сгенерировать идеи' }],
        [{ text: '🎯 Главное меню' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

module.exports = contentGenerationScene;
