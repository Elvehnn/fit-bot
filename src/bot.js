// src/bot.js
const { Telegraf, session, Scenes } = require('telegraf');
const config = require('./config');
const initDatabase = require('./models/initDB');
const { User, UserQuestionnaire, TrainerInvite, Trainer } = require('./models/associations');
const { startAdminServer } = require('./admin/startAdminServer');

const bot = new Telegraf(config.bot.token);

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
const createOrGetUser = async (telegramUser) => {
  try {
    const [user, created] = await User.findOrCreate({
      where: { telegramId: telegramUser.id },
      defaults: {
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name || '',
        username: telegramUser.username || null,
      },
    });

    if (created) {
      console.log(`✅ Создан новый пользователь: ${telegramUser.id}`);
    }

    return user;
  } catch (error) {
    console.error('❌ Ошибка создания пользователя:', error);
    throw error;
  }
};

const checkQuestionnaire = async (userId) => {
  try {
    const questionnaire = await UserQuestionnaire.findOne({
      where: { userId },
    });
    return !!questionnaire;
  } catch (error) {
    console.error('Ошибка проверки анкеты:', error);
    return false;
  }
};

const updateUserQuestionnaireFlag = async (userId, hasQuestionnaire = true) => {
  try {
    await User.update(
      {
        hasQuestionnaire,
        questionnaireUpdatedAt: hasQuestionnaire ? new Date() : null,
      },
      { where: { id: userId } }
    );
    return true;
  } catch (error) {
    console.error('Ошибка обновления флага анкеты:', error);
    return false;
  }
};

const showConsultationWarning = async (ctx) => {
  await ctx.reply(
    '📝 <b>Анкета не заполнена</b>\n\nДля более эффективной консультации нутрициологу нужна информация о ваших данных и целях.',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Заполнить анкету сейчас', callback_data: 'fill_questionnaire_now' },
            { text: '📅 Записаться без анкеты', callback_data: 'book_without_questionnaire' },
          ],
          [{ text: '🏠 В главное меню', callback_data: 'to_main_menu' }],
        ],
      },
    }
  );
};

// ========== СЦЕНА ДЛЯ АНКЕТЫ ==========
const questionnaireWizard = new Scenes.WizardScene(
  'QUESTIONNAIRE_SCENE',

  // Шаг 0: Создание пользователя
  async (ctx) => {
    try {
      // Создаем/получаем пользователя перед началом анкеты
      ctx.user = await createOrGetUser(ctx.from);

      await ctx.reply('📝 <b>Шаг 1 из 8</b>\n\nСколько вам лет?', {
        parse_mode: 'HTML',
      });
      return ctx.wizard.next();
    } catch (error) {
      console.error('Ошибка при создании пользователя:', error);
      await ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
      return ctx.scene.leave();
    }
  },

  // Шаг 1: Возраст
  async (ctx) => {
    const age = parseInt(ctx.message?.text);
    if (!age || age < 1 || age > 120) {
      await ctx.reply('❌ Пожалуйста, введите корректный возраст (от 1 до 120 лет)');
      return;
    }

    ctx.wizard.state.answers = { age };

    await ctx.reply('📝 <b>Шаг 2 из 8</b>\n\nВаш пол?', {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [[{ text: '👨 Мужской' }, { text: '👩 Женский' }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    return ctx.wizard.next();
  },

  // Шаг 2: Вес
  async (ctx) => {
    const genderText = ctx.message.text.toLowerCase();
    let gender;

    if (genderText.includes('муж') || genderText === '👨 мужской') {
      gender = 'male';
    } else if (genderText.includes('жен') || genderText === '👩 женский') {
      gender = 'female';
    } else {
      await ctx.reply('❌ Пожалуйста, выберите пол из предложенных вариантов');
      return;
    }

    ctx.wizard.state.answers.gender = gender;

    await ctx.reply('📝 <b>Шаг 3 из 8</b>\n\nВаш вес (в кг)?\n\n<i>Пример: 65.5 или 70</i>', {
      parse_mode: 'HTML',
      reply_markup: { remove_keyboard: true },
    });
    return ctx.wizard.next();
  },

  // Шаг 3: Рост
  async (ctx) => {
    const weight = parseFloat(ctx.message?.text?.replace(',', '.'));
    if (!weight || weight < 20 || weight > 300) {
      await ctx.reply('❌ Пожалуйста, введите корректный вес (от 20 до 300 кг)');
      return;
    }

    ctx.wizard.state.answers.weight = weight;

    await ctx.reply('📝 <b>Шаг 4 из 8</b>\n\nВаш рост (в см)?\n\n<i>Пример: 175</i>', {
      parse_mode: 'HTML',
    });
    return ctx.wizard.next();
  },

  // Шаг 4: Цель
  async (ctx) => {
    const height = parseFloat(ctx.message?.text);
    if (!height || height < 50 || height > 250) {
      await ctx.reply('❌ Пожалуйста, введите корректный рост (от 50 до 250 см)');
      return;
    }

    ctx.wizard.state.answers.height = height;

    await ctx.reply('📝 <b>Шаг 5 из 8</b>\n\nКакова ваша основная цель?', {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          [{ text: '📉 Похудеть' }],
          [{ text: '📈 Набрать вес' }],
          [{ text: '⚖️ Поддерживать форму' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    return ctx.wizard.next();
  },

  // Шаг 5: Образ жизни
  async (ctx) => {
    const goalText = ctx.message.text.toLowerCase();
    let goal;

    if (goalText.includes('похуд')) goal = 'lose_weight';
    else if (goalText.includes('набрать')) goal = 'gain_weight';
    else if (goalText.includes('поддерживать') || goalText.includes('форма')) goal = 'keep_fit';
    else {
      await ctx.reply('❌ Пожалуйста, выберите цель из предложенных вариантов');
      return;
    }

    ctx.wizard.state.answers.goal = goal;

    await ctx.reply('📝 <b>Шаг 6 из 8</b>\n\nКак бы вы описали свой образ жизни?', {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          [{ text: '🪑 Сидячий (офисная работа, мало активности)' }],
          [{ text: '🚶 Умеренный (регулярные прогулки, легкие тренировки)' }],
          [{ text: '🏃 Активный (тренировки 3+ раза в неделю, физическая работа)' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    return ctx.wizard.next();
  },

  // Шаг 6: Проблемы
  async (ctx) => {
    const lifestyleText = ctx.message.text.toLowerCase();
    let lifestyle;

    if (lifestyleText.includes('сидячий')) lifestyle = 'sedentary';
    else if (lifestyleText.includes('умерен')) lifestyle = 'moderate';
    else if (lifestyleText.includes('актив')) lifestyle = 'active';
    else {
      await ctx.reply('❌ Пожалуйста, выберите вариант из предложенных');
      return;
    }

    ctx.wizard.state.answers.lifestyle = lifestyle;

    await ctx.reply(
      '📝 <b>Шаг 7 из 8</b>\n\nС какими проблемами в питании сталкиваетесь?\n\n<i>Например: Заедание стресса, срывы на сладкое, поздние ужины, нет времени готовить и т.д.</i>',
      {
        parse_mode: 'HTML',
        reply_markup: { remove_keyboard: true },
      }
    );
    return ctx.wizard.next();
  },

  // Шаг 7: Ограничения
  async (ctx) => {
    ctx.wizard.state.answers.problems = ctx.message.text;

    await ctx.reply(
      '📝 <b>Шаг 8 из 8</b>\n\nЕсть ли у вас ограничения в питании?\n\n<i>Например: Вегетарианство, аллергия на лактозу, непереносимость глютена, диабет и т.д.\nЕсли нет, напишите "нет"</i>',
      {
        parse_mode: 'HTML',
      }
    );
    return ctx.wizard.next();
  },

  // Шаг 8: Комментарий и сохранение
  async (ctx) => {
    ctx.wizard.state.answers.restrictions = ctx.message.text === 'нет' ? null : ctx.message.text;

    await ctx.reply(
      '💬 <b>Последний вопрос</b>\n\nХотите что-то добавить? (Дополнительные комментарии или пожелания)\n\n<i>Если нет, напишите "пропустить"</i>',
      {
        parse_mode: 'HTML',
      }
    );
    return ctx.wizard.next();
  },

  // Финал: Сохранение и расчеты
  async (ctx) => {
    const comment = ctx.message.text.toLowerCase() === 'пропустить' ? null : ctx.message.text;
    ctx.wizard.state.answers.comment = comment;

    try {
      // Проверяем, что пользователь создан
      if (!ctx.user) {
        ctx.user = await createOrGetUser(ctx.from);
      }

      const userId = ctx.user.id;

      // Сохраняем анкету
      const [questionnaire, created] = await UserQuestionnaire.findOrCreate({
        where: { userId },
        defaults: {
          userId,
          ...ctx.wizard.state.answers,
        },
      });

      if (!created) {
        // Обновляем существующую анкету
        await questionnaire.update(ctx.wizard.state.answers);
      }

      // Обновляем флаг анкеты у пользователя
      await updateUserQuestionnaireFlag(userId, true);
      ctx.user.hasQuestionnaire = true;

      // Рассчитываем базовый метаболизм
      const { age, gender, weight, height, lifestyle } = ctx.wizard.state.answers;

      // BMR расчет
      let bmr;
      if (gender === 'male') {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      } else {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
      }

      // Коэффициент активности
      const activityMultiplier = {
        sedentary: 1.2,
        moderate: 1.55,
        active: 1.725,
      };

      const tdee = Math.round(bmr * activityMultiplier[lifestyle]);

      // Рекомендации по калориям
      let targetCalories;
      let recommendation;

      switch (ctx.wizard.state.answers.goal) {
        case 'lose_weight':
          targetCalories = tdee - 500;
          recommendation = 'Для плавного похудения рекомендуется дефицит 500 ккал в день';
          break;
        case 'gain_weight':
          targetCalories = tdee + 500;
          recommendation = 'Для набора массы рекомендуется профицит 500 ккал в день';
          break;
        case 'keep_fit':
          targetCalories = tdee;
          recommendation = 'Для поддержания веса рекомендуется придерживаться расхода калорий';
          break;
      }

      // Формируем результат
      await ctx.reply('✅ <b>Анкета успешно сохранена!</b>', {
        parse_mode: 'HTML',
        reply_markup: { remove_keyboard: true },
      });

      await ctx.reply(
        `📊 <b>Ваши данные:</b>

• Возраст: ${age} лет
• Пол: ${gender === 'male' ? 'Мужской' : 'Женский'}
• Вес: ${weight} кг
• Рост: ${height} см
• Цель: ${
          ctx.wizard.state.answers.goal === 'lose_weight'
            ? 'Похудеть'
            : ctx.wizard.state.answers.goal === 'gain_weight'
              ? 'Набрать вес'
              : 'Поддерживать форму'
        }
• Образ жизни: ${
          lifestyle === 'sedentary'
            ? 'Сидячий'
            : lifestyle === 'moderate'
              ? 'Умеренный'
              : 'Активный'
        }
• Проблемы: ${ctx.wizard.state.answers.problems}
• Ограничения: ${ctx.wizard.state.answers.restrictions || 'Нет'}
• Комментарий: ${comment || 'Нет'}

🎯 <b>Расчеты:</b>
• Базальный метаболизм (BMR): ${Math.round(bmr)} ккал/день
• Суточный расход (TDEE): ${tdee} ккал/день
• Рекомендуемая норма: ${targetCalories} ккал/день
• ${recommendation}`,
        {
          parse_mode: 'HTML',
        }
      );

      // Предложение консультации
      await ctx.reply(
        '👩‍⚕️ <b>Хотите получить персонализированную консультацию нутрициолога?</b>\n\nТеперь, когда ваша анкета заполнена, мы можем предложить более точные рекомендации.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Записаться на консультацию', callback_data: 'book_consultation' }],
              [{ text: '🏠 В главное меню', callback_data: 'to_main_menu' }],
            ],
          },
        }
      );
    } catch (error) {
      console.error('❌ Ошибка сохранения анкеты:', error);
      await ctx.reply('❌ Произошла ошибка при сохранении анкеты. Пожалуйста, попробуйте позже.', {
        reply_markup: { remove_keyboard: true },
      });
    }

    return ctx.scene.leave();
  }
);

// ========== РЕГИСТРАЦИЯ СЦЕН ==========
const stage = new Scenes.Stage([questionnaireWizard]);
bot.use(session());
bot.use(stage.middleware());

// ========== ГЛАВНОЕ МЕНЮ ==========
const showMainMenu = async (ctx, message = '🎯 <b>Главное меню</b>\n\nВыберите действие:') => {
  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: [
        [{ text: '📝 Заполнить анкету' }, { text: '📅 Запись на консультацию' }],
        [{ text: '👤 Мой профиль' }, { text: '🆘 Помощь' }],
      ],
      resize_keyboard: true,
    },
  });
};

const isAdmin = (telegramId) => {
  const ids = config.admin?.telegramIds || [];
  return ids.includes(Number(telegramId));
};

// ========== ОБРАБОТЧИКИ КОМАНД ==========
bot.command('start', async (ctx) => {
  try {
    const text = String(ctx.message?.text || '');
    const payload = text.startsWith('/start') ? text.replace('/start', '').trim() : '';
    if (payload.startsWith('invite_')) {
      const code = payload.replace('invite_', '').trim();
      if (code) {
        const invite = await TrainerInvite.findOne({ where: { code } });
        if (!invite) {
          await ctx.reply('❌ Приглашение не найдено. Проверьте ссылку.');
        } else if (invite.usedAt || invite.usedByUserId) {
          await ctx.reply('❌ Этот код уже использован. Попросите тренера создать новую ссылку.');
        } else {
          const user = await createOrGetUser(ctx.from);
          await user.update({ trainerId: invite.trainerId });
          await invite.update({ usedAt: new Date(), usedByUserId: user.id });
          await ctx.reply('✅ Вы успешно привязаны к тренеру.');
        }
      }
    }
  } catch (e) {
    console.error('Ошибка обработки invite:', e);
  }

  await ctx.reply(`Привет, ${ctx.from.first_name}! 👋  
Я — бот‑ассистент по питанию, который работает вместе с нутрициологом‑экспертом.  

Я задам тебе несколько простых вопросов об образе жизни, целях и предпочтениях в еде. На основе твоих ответов я:  
- рассчитаю примерный дневной лимит калорий с учётом анкеты;  
- дам базовые рекомендации по питанию;  
- смогу предложить консультацию нутрициолога;  
- а также примерное меню на день, составленное под твой калораж.  

Готов(а) заполнить анкету? 🙂`);

  await showMainMenu(ctx);
});

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply('⛔️ Доступ запрещён.');
    return;
  }

  const url = config.admin?.webAppUrl;
  if (!url) {
    await ctx.reply(
      '⚠️ Не настроена ссылка на админку.\n\nДобавьте переменную окружения ADMIN_WEBAPP_URL (например, https://ваш-домен/admin).'
    );
    return;
  }

  await ctx.reply('🛡️ Админка', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Открыть админку', web_app: { url } }]],
    },
  });
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `🆘 <b>Доступные команды:</b>

/start - Начать работу
/profile - Мой профиль
/help - Помощь

<b>Основные функции:</b>
• Заполнить анкету по питанию
• Запись на консультацию нутрициолога
• Просмотр сохраненных данных`,
    {
      parse_mode: 'HTML',
    }
  );
});

bot.command('profile', async (ctx) => {
  try {
    // Сначала пытаемся найти пользователя
    let user = await User.findOne({
      where: { telegramId: ctx.from.id },
    });

    if (!user) {
      await ctx.reply(
        '📝 <b>Профиль не найден</b>\n\nВы еще не заполняли анкету и не записывались на консультацию.\n\nХотите начать работу?',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Заполнить анкету', callback_data: 'fill_questionnaire_now' }],
              [{ text: '📅 Запись на консультацию', callback_data: 'book_without_questionnaire' }],
            ],
          },
        }
      );
      return;
    }

    // Ищем анкету пользователя
    const questionnaire = await UserQuestionnaire.findOne({
      where: { userId: user.id },
    });

    let profileText = `👤 <b>Ваш профиль:</b>\n\n`;
    profileText += `Имя: ${user.firstName}\n`;
    profileText += `Статус анкеты: ${user.hasQuestionnaire ? '✅ Заполнена' : '❌ Не заполнена'}\n`;

    if (user.questionnaireUpdatedAt) {
      profileText += `Обновлена: ${user.questionnaireUpdatedAt.toLocaleDateString('ru-RU')}\n`;
    }

    if (questionnaire) {
      profileText += `\n📊 <b>Данные анкеты:</b>\n`;
      profileText += `• Возраст: ${questionnaire.age} лет\n`;
      profileText += `• Пол: ${questionnaire.gender === 'male' ? 'Мужской' : 'Женский'}\n`;
      profileText += `• Вес: ${questionnaire.weight} кг\n`;
      profileText += `• Рост: ${questionnaire.height} см\n`;
      profileText += `• Цель: ${
        questionnaire.goal === 'lose_weight'
          ? 'Похудеть'
          : questionnaire.goal === 'gain_weight'
            ? 'Набрать вес'
            : 'Поддерживать форму'
      }\n`;
      profileText += `• Образ жизни: ${
        questionnaire.lifestyle === 'sedentary'
          ? 'Сидячий'
          : questionnaire.lifestyle === 'moderate'
            ? 'Умеренный'
            : 'Активный'
      }\n`;
    }

    await ctx.reply(profileText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          questionnaire
            ? [{ text: '🔄 Обновить анкету', callback_data: 'update_questionnaire' }]
            : [{ text: '📝 Заполнить анкету', callback_data: 'fill_questionnaire_now' }],
          [{ text: '🏠 В главное меню', callback_data: 'to_main_menu' }],
        ],
      },
    });
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке профиля');
  }
});

// ========== ОБРАБОТЧИКИ КНОПОК ==========
bot.hears('📝 Заполнить анкету', async (ctx) => {
  await ctx.reply('Отлично! Начнем заполнение анкеты. 🍏', {
    reply_markup: { remove_keyboard: true },
  });
  await ctx.scene.enter('QUESTIONNAIRE_SCENE');
});

bot.hears('📅 Запись на консультацию', async (ctx) => {
  try {
    // Создаем/получаем пользователя при записи на консультацию
    const user = await createOrGetUser(ctx.from);
    ctx.user = user;

    // Проверяем, заполнена ли анкета
    if (!user.hasQuestionnaire) {
      await showConsultationWarning(ctx);
      return;
    }

    // Анкета заполнена - показываем стандартное меню
    await showConsultationMenu(ctx);
  } catch (error) {
    console.error('Ошибка при записи на консультацию:', error);
    await ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

bot.hears('👤 Мой профиль', async (ctx) => {
  ctx.reply('/profile');
});

bot.hears('🆘 Помощь', async (ctx) => {
  ctx.reply('/help');
});

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ КОНСУЛЬТАЦИЙ ==========
const showConsultationMenu = async (ctx) => {
  await ctx.reply(
    '👩‍⚕️ <b>Запись на консультацию к нутрициологу</b>\n\nДля записи на индивидуальную консультацию:\n\n1. Выберите удобное время\n2. Укажите предпочтительный способ связи (Zoom, Telegram, телефон)\n3. Опишите дополнительные вопросы, которые хотите обсудить\n\n<i>Наш специалист свяжется с вами в течение 24 часов.</i>',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Выбрать время', callback_data: 'select_time' }],
          [{ text: '📞 Связаться сейчас', url: 'https://t.me/ваш_нутрициолог' }],
          [{ text: '🏠 В главное меню', callback_data: 'to_main_menu' }],
        ],
      },
    }
  );
};

// ========== INLINE-КОНПКИ ==========
// Заполнить анкету сейчас
bot.action('fill_questionnaire_now', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  await ctx.reply('Отлично! Начнем заполнение анкеты. 🍏', {
    reply_markup: { remove_keyboard: true },
  });
  await ctx.scene.enter('QUESTIONNAIRE_SCENE');
});

// Записаться без анкеты
bot.action('book_without_questionnaire', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  try {
    // Создаем пользователя при записи без анкеты
    const user = await createOrGetUser(ctx.from);
    ctx.user = user;

    await showConsultationMenu(ctx);
  } catch (error) {
    console.error('Ошибка при записи без анкеты:', error);
    await ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Запись на консультацию (после заполнения анкеты)
bot.action('book_consultation', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '👩‍⚕️ <b>Запись на консультацию</b>\n\nПожалуйста, выберите удобный способ связи:',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Выбрать время для Zoom', callback_data: 'zoom_consultation' }],
          [{ text: '💬 Консультация в Telegram', callback_data: 'tg_consultation' }],
          [{ text: '📞 Телефонный звонок', callback_data: 'phone_consultation' }],
          [{ text: '🏠 В главное меню', callback_data: 'to_main_menu' }],
        ],
      },
    }
  );
});

// Возврат в главное меню
bot.action(['to_main_menu', 'update_questionnaire'], async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  await showMainMenu(ctx);
});

// Выбор типа консультации
bot.action(
  ['zoom_consultation', 'tg_consultation', 'phone_consultation', 'select_time'],
  async (ctx) => {
    await ctx.answerCbQuery();

    const consultationType = {
      zoom_consultation: 'Zoom консультация',
      tg_consultation: 'Telegram консультация',
      phone_consultation: 'Телефонный звонок',
      select_time: 'Выбор времени',
    };

    // Проверяем, есть ли пользователь и анкета
    let hasQuestionnaire = false;
    try {
      const user = await User.findOne({
        where: { telegramId: ctx.from.id },
      });
      hasQuestionnaire = user ? user.hasQuestionnaire : false;
    } catch (error) {
      console.error('Ошибка проверки анкеты:', error);
    }

    const questionnaireNote = hasQuestionnaire
      ? '\n\n📋 <b>Ваша анкета будет доступна нутрициологу</b>'
      : '\n\n⚠️ <b>Анкета не заполнена. Рекомендуем заполнить её перед консультацией.</b>';

    await ctx.reply(
      `✅ Вы выбрали: <b>${consultationType[ctx.callbackQuery.data]}</b>${questionnaireNote}\n\nНаш менеджер свяжется с вами в течение 2 часов для уточнения деталей.\n\n📧 Контакт для связи: @ваш_нутрициолог\n📞 Телефон: +7 (XXX) XXX-XX-XX`,
      {
        parse_mode: 'HTML',
      }
    );

    if (!hasQuestionnaire) {
      await ctx.reply('📝 Хотите заполнить анкету сейчас?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Да, заполнить анкету', callback_data: 'fill_questionnaire_now' }],
            [{ text: '🚫 Нет, продолжить', callback_data: 'to_main_menu' }],
          ],
        },
      });
    } else {
      await showMainMenu(ctx, 'Что еще вас интересует?');
    }
  }
);

// ========== ЗАПУСК БОТА ==========
const start = async () => {
  try {
    await initDatabase();
    console.log('✅ База данных инициализирована');

    // Автосоздание тренеров из env: TRAINER_TELEGRAM_IDS=1,2,3
    const trainerIds = config.trainer?.telegramIds || [];
    if (trainerIds.length) {
      const existing = await Trainer.findAll({ where: { telegramId: trainerIds } });
      const existingSet = new Set(existing.map((t) => Number(t.telegramId)).filter((x) => Number.isFinite(x)));
      const toCreate = trainerIds.filter((id) => !existingSet.has(Number(id)));
      if (toCreate.length) {
        await Trainer.bulkCreate(toCreate.map((telegramId) => ({ telegramId })));
        console.log(`✅ Созданы тренеры: ${toCreate.join(', ')}`);
      }
    }

    startAdminServer();

    await bot.launch();
    console.log('🤖 Бот запущен');

    // Элегантное завершение
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('❌ Не удалось запустить бота:', error);
    process.exit(1);
  }
};

start();

module.exports = bot;
