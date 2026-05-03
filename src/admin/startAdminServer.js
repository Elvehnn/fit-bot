const config = require('../config');
const { createAdminApp } = require('./adminApp');

function startAdminServer() {
  const app = createAdminApp({
    botToken: config.bot.token,
    adminIds: config.admin.telegramIds,
  });

  const port = Number(config.server.port) || 3000;
  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`🛡️ Admin WebApp: http://localhost:${port}/admin`);
  });

  return server;
}

module.exports = { startAdminServer };

