// src/middleware/userMiddleware.js
const { User } = require('../models/associations');

const sceneUserMiddleware = async (ctx, next) => {
  if (ctx.from && !ctx.user) {
    const [user] = await User.findOrCreate({
      where: { telegramId: ctx.from.id },
      defaults: {
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name || '',
        username: ctx.from.username || null,
      },
    });
    ctx.user = user;
  }
  return next();
};

module.exports = sceneUserMiddleware;
