// src/bot.js
const { Telegraf, session, Scenes } = require('telegraf');
const config = require('./config');
const initDatabase = require('./models/initDB');
const { User, UserQuestionnaire, TrainerInvite, Trainer } = require('./models/associations');
const sequelize = require('./models/database');
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

const Q_BTN_CANCEL = '❌ Отмена';

function isQuestionnaireCancel(ctx) {
  const t = (ctx.message?.text || '').trim();
  return t === Q_BTN_CANCEL || t.toLowerCase() === 'отмена';
}

function questionnaireCancelKeyboard() {
  return {
    keyboard: [[{ text: Q_BTN_CANCEL }]],
    resize_keyboard: true,
  };
}

// ========== ГЛАВНОЕ МЕНЮ (раньше сцены анкеты — для отмены без сохранения) ==========
const showMainMenu = async (ctx, message = '🎯 <b>Главное меню</b>\n\nВыберите действие:') => {
  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: [
        [{ text: '📝 Заполнить анкету' }],
        [{ text: '👤 Мой профиль' }, { text: '🆘 Помощь' }],
      ],
      resize_keyboard: true,
    },
  });
};

async function exitQuestionnaireCancelled(ctx) {
  await ctx.scene.leave();
  await ctx.reply('Заполнение анкеты отменено. Данные не сохранены.', {
    reply_markup: { remove_keyboard: true },
  });
  await showMainMenu(ctx);
}

// ========== СЦЕНА ДЛЯ АНКЕТЫ ==========
const questionnaireWizard = new Scenes.WizardScene(
  'QUESTIONNAIRE_SCENE',

  // Шаг 0: Создание пользователя
  async (ctx) => {
    try {
      // Создаем/получаем пользователя перед началом анкеты
      ctx.user = await createOrGetUser(ctx.from);

      await ctx.reply(
        '📝 <b>Шаг 1 из 8</b>\n\nСколько вам лет?\n\n<i>Чтобы выйти без сохранения — кнопка «Отмена».</i>',
        {
          parse_mode: 'HTML',
          reply_markup: questionnaireCancelKeyboard(),
        }
      );
      return ctx.wizard.next();
    } catch (error) {
      console.error('Ошибка при создании пользователя:', error);
      await ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
      return ctx.scene.leave();
    }
  },

  // Шаг 1: Возраст
  async (ctx) => {
    if (isQuestionnaireCancel(ctx)) {
      await exitQuestionnaireCancelled(ctx);
      return;
    }
    const age = parseInt(ctx.message?.text);
    if (!age || age < 1 || age > 120) {
      await ctx.reply('❌ Пожалуйста, введите корректный возраст (от 1 до 120 лет)');
      return;
    }

    ctx.wizard.state.answers = { age };

    await ctx.reply('📝 <b>Шаг 2 из 8</b>\n\nВаш пол?', {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [[{ text: '👨 Мужской' }, { text: '👩 Женский' }], [{ text: Q_BTN_CANCEL }]],
        resize_keyboard: true,
      },
    });
    return ctx.wizard.next();
  },

  // Шаг 2: Вес
  async (ctx) => {
    if (isQuestionnaireCancel(ctx)) {
      await exitQuestionnaireCancelled(ctx);
      return;
    }
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
      reply_markup: questionnaireCancelKeyboard(),
    });
    return ctx.wizard.next();
  },

  // Шаг 3: Рост
  async (ctx) => {
    if (isQuestionnaireCancel(ctx)) {
      await exitQuestionnaireCancelled(ctx);
      return;
    }
    const weight = parseFloat(ctx.message?.text?.replace(',', '.'));
    if (!weight || weight < 20 || weight > 300) {
      await ctx.reply('❌ Пожалуйста, введите корректный вес (от 20 до 300 кг)');
      return;
    }

    ctx.wizard.state.answers.weight = weight;

    await ctx.reply('📝 <b>Шаг 4 из 8</b>\n\nВаш рост (в см)?\n\n<i>Пример: 175</i>', {
      parse_mode: 'HTML',
      reply_markup: questionnaireCancelKeyboard(),
    });
    return ctx.wizard.next();
  },

  // Шаг 4: Цель
  async (ctx) => {
    if (isQuestionnaireCancel(ctx)) {
      await exitQuestionnaireCancelled(ctx);
      return;
    }
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
          [{ text: Q_BTN_CANCEL }],
        ],
        resize_keyboard: true,
      },
    });
    return ctx.wizard.next();
  },

  // Шаг 5: Образ жизни
  async (ctx) => {
    if (isQuestionnaireCancel(ctx)) {
      await exitQuestionnaireCancelled(ctx);
      return;
    }
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
          [{ text: Q_BTN_CANCEL }],
        ],
        resize_keyboard: true,
      },
    });
    return ctx.wizard.next();
  },

  // Шаг 6: Проблемы
  async (ctx) => {
    if (isQuestionnaireCancel(ctx)) {
      await exitQuestionnaireCancelled(ctx);
      return;
    }
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
        reply_markup: questionnaireCancelKeyboard(),
      }
    );
    return ctx.wizard.next();
  },

  // Шаг 7: Ограничения
  async (ctx) => {
    if (isQuestionnaireCancel(ctx)) {
      await exitQuestionnaireCancelled(ctx);
      return;
    }
    ctx.wizard.state.answers.problems = ctx.message.text;

    await ctx.reply(
      '📝 <b>Шаг 8 из 8</b>\n\nЕсть ли у вас ограничения в питании?\n\n<i>Например: Вегетарианство, аллергия на лактозу, непереносимость глютена, диабет и т.д.\nЕсли нет, напишите "нет"</i>',
      {
        parse_mode: 'HTML',
        reply_markup: questionnaireCancelKeyboard(),
      }
    );
    return ctx.wizard.next();
  },

  // Шаг 8: Комментарий и сохранение
  async (ctx) => {
    if (isQuestionnaireCancel(ctx)) {
      await exitQuestionnaireCancelled(ctx);
      return;
    }
    ctx.wizard.state.answers.restrictions = ctx.message.text === 'нет' ? null : ctx.message.text;

    await ctx.reply(
      '💬 <b>Последний вопрос</b>\n\nХотите что-то добавить? (Дополнительные комментарии или пожелания)\n\n<i>Если нет, нажмите «Пропустить»</i>',
      {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [[{ text: '⏭️ Пропустить' }], [{ text: Q_BTN_CANCEL }]],
          resize_keyboard: true,
        },
      }
    );
    return ctx.wizard.next();
  },

  // Финал: Сохранение и расчеты
  async (ctx) => {
    if (isQuestionnaireCancel(ctx)) {
      await exitQuestionnaireCancelled(ctx);
      return;
    }
    const normalizedComment = String(ctx.message.text || '')
      .trim()
      .toLowerCase();
    const comment = normalizedComment === 'пропустить' || normalizedComment.includes('пропустить') ? null : ctx.message.text;
    ctx.wizard.state.answers.comment = comment;

    try {
      // Проверяем, что пользователь создан
      if (!ctx.user) {
        ctx.user = await createOrGetUser(ctx.from);
      }

      const userId = ctx.user.id;

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
      let recommendedCalorieDelta;
      let recommendation;

      switch (ctx.wizard.state.answers.goal) {
        case 'lose_weight':
          recommendedCalorieDelta = -200;
          targetCalories = tdee + recommendedCalorieDelta;
          recommendation = 'Для плавного похудения рекомендуется дефицит 200 ккал в день';
          break;
        case 'gain_weight':
          recommendedCalorieDelta = 200;
          targetCalories = tdee + recommendedCalorieDelta;
          recommendation = 'Для набора массы рекомендуется профицит 200 ккал в день';
          break;
        case 'keep_fit':
          recommendedCalorieDelta = 0;
          targetCalories = tdee;
          recommendation = 'Для поддержания веса рекомендуется придерживаться расхода калорий';
          break;
      }

      const questionnaireData = {
        ...ctx.wizard.state.answers,
        tdeeCalories: tdee,
        recommendedCalorieDelta,
      };

      // Сохраняем анкету
      const [questionnaire, created] = await UserQuestionnaire.findOrCreate({
        where: { userId },
        defaults: {
          userId,
          ...questionnaireData,
        },
      });

      if (!created) {
        // Обновляем существующую анкету
        await questionnaire.update(questionnaireData);
      }

      // Обновляем флаг анкеты у пользователя
      await updateUserQuestionnaireFlag(userId, true);
      ctx.user.hasQuestionnaire = true;

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
• Рекомендуемое отклонение: ${recommendedCalorieDelta > 0 ? '+' : ''}${recommendedCalorieDelta} ккал/день
• Рекомендуемая норма: ${targetCalories} ккал/день
• ${recommendation}`,
        {
          parse_mode: 'HTML',
        }
      );

      await ctx.reply(
        'Можете открыть анкету в любой момент: команда /profile или кнопка «Мой профиль».',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 В главное меню', callback_data: 'to_main_menu' }]],
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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function goalLabelRu(goal) {
  if (goal === 'lose_weight') return 'Похудеть';
  if (goal === 'gain_weight') return 'Набрать вес';
  if (goal === 'keep_fit') return 'Поддерживать форму';
  return goal || '—';
}

function lifestyleLabelRu(l) {
  if (l === 'sedentary') return 'Сидячий';
  if (l === 'moderate') return 'Умеренный';
  if (l === 'active') return 'Активный';
  return l || '—';
}

async function getTrainerLineHtml(ctx, user) {
  if (!user.trainerId) {
    return '\n\n🏋️ <b>Ваш тренер:</b> пока не назначен. Попросите у тренера пригласительную ссылку.';
  }
  const trainer = await Trainer.findByPk(user.trainerId);
  if (!trainer) return '\n\n🏋️ <b>Ваш тренер:</b> данные не найдены.';
  const display = await resolveTrainerDisplayName(ctx, trainer.telegramId);
  if (display) return `\n\n🏋️ <b>Ваш тренер:</b> ${escapeHtml(display)}`;
  return '\n\n🏋️ <b>Ваш тренер:</b> назначен.';
}

function formatQuestionnaireHtml(q) {
  if (!q) return '';
  const gender =
    q.gender === 'male'
      ? 'Мужской'
      : q.gender === 'female'
        ? 'Женский'
        : escapeHtml(q.gender || '—');
  const lines = [
    `• Возраст: ${escapeHtml(String(q.age))} лет`,
    `• Пол: ${gender}`,
    `• Вес: ${escapeHtml(String(q.weight))} кг`,
    `• Рост: ${escapeHtml(String(q.height))} см`,
    `• Цель: ${escapeHtml(goalLabelRu(q.goal))}`,
    `• Образ жизни: ${escapeHtml(lifestyleLabelRu(q.lifestyle))}`,
  ];
  if (q.problems) lines.push(`• Проблемы: ${escapeHtml(q.problems)}`);
  if (q.restrictions) lines.push(`• Ограничения: ${escapeHtml(q.restrictions)}`);
  if (q.comment) lines.push(`• Комментарий: ${escapeHtml(q.comment)}`);
  return lines.join('\n');
}

const HELP_TEXT = `🆘 <b>Команды бота</b>

/start — начать работу с ботом и открыть главное меню
/profile — посмотреть анкету и информацию о тренере
/help — этот список команд
/admin — панель для администраторов (Web App)`;

async function sendProfile(ctx) {
  try {
    const user = await User.findOne({
      where: { telegramId: ctx.from.id },
      include: [{ model: Trainer, as: 'trainer', required: false }],
    });

    if (!user) {
      await ctx.reply(
        '📝 <b>Профиль не найден</b>\n\nВы ещё не пользовались ботом. Заполните анкету, чтобы сохранить данные.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Заполнить анкету', callback_data: 'fill_questionnaire_now' }],
              [{ text: '🏠 В главное меню', callback_data: 'to_main_menu' }],
            ],
          },
        }
      );
      return;
    }

    const questionnaire = await UserQuestionnaire.findOne({
      where: { userId: user.id },
    });
    const trainerLine = await getTrainerLineHtml(ctx, user);

    let profileText = `👤 <b>Ваш профиль</b>\n\n`;
    profileText += `Имя: ${escapeHtml(user.firstName)}\n`;
    profileText += `Анкета: ${user.hasQuestionnaire && questionnaire ? '✅ заполнена' : '❌ не заполнена'}\n`;
    if (user.questionnaireUpdatedAt) {
      profileText += `Обновлена: ${escapeHtml(user.questionnaireUpdatedAt.toLocaleString('ru-RU'))}\n`;
    }

    if (questionnaire) {
      profileText += `\n📋 <b>Анкета</b>\n${formatQuestionnaireHtml(questionnaire)}`;
    } else {
      profileText += '\n\nЗаполните анкету через кнопку ниже или «📝 Заполнить анкету» в меню.';
    }
    profileText += trainerLine;

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
}

const isAdmin = (telegramId) => {
  const ids = config.admin?.telegramIds || [];
  return ids.includes(Number(telegramId));
};

async function resolveTrainerDisplayName(ctx, trainerTelegramId) {
  try {
    const chat = await ctx.telegram.getChat(trainerTelegramId);
    const parts = [chat.first_name, chat.last_name].filter(Boolean);
    if (parts.length) return parts.join(' ');
    if (chat.username) return `@${chat.username}`;
  } catch (e) {
    // бот мог ещё не видеть чат с тренером
  }
  return null;
}

const sendDefaultStartWelcome = async (ctx) => {
  await ctx.reply(`Привет, ${ctx.from.first_name}! 👋  
Я — бот‑ассистент по питанию, который работает вместе с нутрициологом‑экспертом.  

Я задам тебе несколько простых вопросов об образе жизни, целях и предпочтениях в еде. На основе твоих ответов я:  
• рассчитаю примерный дневной лимит калорий с учётом анкеты;  
• дам базовые рекомендации по питанию;  
• подскажу примерное меню на день под твой калораж.  

Готов(а) заполнить анкету? 🙂`);

  await showMainMenu(ctx);
};

// ========== ОБРАБОТЧИКИ КОМАНД ==========
bot.command('start', async (ctx) => {
  const text = String(ctx.message?.text || '');
  const payload = text.replace(/^\/start\s*/, '').trim();

  const handleInviteDeepLink = async () => {
    const code = payload.slice('invite_'.length).trim();
    if (!code) return false;

    try {
      const user = await createOrGetUser(ctx.from);

      if (user.trainerId != null) {
        await ctx.reply(
          'Вы уже привязаны к тренеру. Если хотите сменить тренера — обратитесь к текущему тренеру.'
        );
        // await sendDefaultStartWelcome(ctx);
        return true;
      }

      let outcome = { ok: false, trainerTelegramId: null };

      await sequelize.transaction(async (transaction) => {
        const invite = await TrainerInvite.findOne({
          where: { code },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!invite || invite.usedAt || invite.usedByUserId) {
          return;
        }

        const trainer = await Trainer.findByPk(invite.trainerId, { transaction });
        if (!trainer) {
          return;
        }

        await user.update(
          { trainerId: invite.trainerId, trainerLinkedAt: new Date() },
          { transaction }
        );
        await invite.update(
          {
            usedAt: new Date(),
            usedByUserId: user.id,
          },
          { transaction }
        );

        outcome = { ok: true, trainerTelegramId: trainer.telegramId };
      });

      if (!outcome.ok) {
        await ctx.reply('Ссылка недействительна. Запросите новую у вашего тренера.');
        // await sendDefaultStartWelcome(ctx);
        return true;
      }

      await user.reload();
      const tn =
        outcome.trainerTelegramId != null
          ? await resolveTrainerDisplayName(ctx, outcome.trainerTelegramId)
          : null;
      const bindText = tn
        ? `✅ Вы привязаны к тренеру ${tn}. Теперь тренер видит ваш прогресс.`
        : '✅ Вы привязаны к тренеру. Теперь тренер видит ваш прогресс.';
      await ctx.reply(bindText);

      if (!user.hasQuestionnaire) {
        await ctx.reply('Отлично! Начнем заполнение анкеты. 🍏', {
          reply_markup: { remove_keyboard: true },
        });
        await ctx.scene.enter('QUESTIONNAIRE_SCENE');
        return true;
      }

      await showMainMenu(ctx);
      return true;
    } catch (e) {
      console.error('Ошибка обработки invite:', e);
      await ctx.reply(
        '❌ Не удалось обработать ссылку. Попробуйте позже или запросите новую у тренера.'
      );
      // await sendDefaultStartWelcome(ctx);
      return true;
    }
  };

  if (payload.startsWith('invite_')) {
    const handled = await handleInviteDeepLink();
    if (handled) return;
  }

  await sendDefaultStartWelcome(ctx);
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
  await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
});

bot.command('profile', async (ctx) => {
  await sendProfile(ctx);
});

// ========== ОБРАБОТЧИКИ КНОПОК ==========
bot.hears('📝 Заполнить анкету', async (ctx) => {
  await ctx.reply('Отлично! Начнем заполнение анкеты. 🍏', {
    reply_markup: { remove_keyboard: true },
  });
  await ctx.scene.enter('QUESTIONNAIRE_SCENE');
});

bot.hears('👤 Мой профиль', async (ctx) => {
  await sendProfile(ctx);
});

bot.hears('🆘 Помощь', async (ctx) => {
  await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
});

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

// Возврат в главное меню
bot.action('to_main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  await showMainMenu(ctx);
});

bot.action('update_questionnaire', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.deleteMessage();
  } catch (e) {
    // ignore
  }
  await ctx.reply('Начнём обновление анкеты. 🍏', {
    reply_markup: { remove_keyboard: true },
  });
  await ctx.scene.enter('QUESTIONNAIRE_SCENE');
});

// ========== ЗАПУСК БОТА ==========
const start = async () => {
  try {
    await initDatabase();
    console.log('✅ База данных инициализирована');

    // Автосоздание тренеров из env: TRAINER_TELEGRAM_IDS=1,2,3
    const trainerIds = config.trainer?.telegramIds || [];
    if (trainerIds.length) {
      const existing = await Trainer.findAll({ where: { telegramId: trainerIds } });
      const existingSet = new Set(
        existing.map((t) => Number(t.telegramId)).filter((x) => Number.isFinite(x))
      );
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
