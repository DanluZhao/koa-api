const os = require("os");

async function health(ctx) {
  const free = os.freemem();
  const total = os.totalmem();

  ctx.status = 200;
  ctx.body = {
    success: true,
    data: {
      status: "ok",
      time: new Date().toISOString(),
      memory: {
        free,
        total,
        ratioFree: total > 0 ? free / total : null
      }
    }
  };
}

module.exports = {
  health
};
