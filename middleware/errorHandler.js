const crypto = require("crypto");

function errorHandler() {
  return async (ctx, next) => {
    const requestId = ctx.get("x-request-id") || crypto.randomUUID();
    ctx.set("x-request-id", requestId);

    try {
      await next();

      if (ctx.status === 404 && !ctx.body) {
        ctx.throw(404, "Not Found");
      }
    } catch (err) {
      const status = Number.isInteger(err.status) ? err.status : 500;

      ctx.status = status;
      ctx.type = "application/json";
      ctx.body = {
        success: false,
        requestId,
        timestamp: new Date().toISOString(),
        error: {
          message: status >= 500 ? "Internal Server Error" : err.message,
          code: err.code || err.name || "Error"
        }
      };

      if (status >= 500) {
        ctx.app.emit("error", err, ctx);
      }
    }
  };
}

module.exports = {
  errorHandler
};
