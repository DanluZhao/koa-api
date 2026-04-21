const crypto = require("crypto");

function errorHandler() {
  return async (ctx, next) => {
    const requestId = ctx.get("x-request-id") || crypto.randomUUID();
    ctx.set("x-request-id", requestId);

    try {
      await next();

      if (ctx.status === 404 && !ctx.body) {
        ctx.status = 200;
        ctx.type = "application/json";
        ctx.body = {
          success: false,
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Not Found"
          }
        };
      }
    } catch (err) {
      ctx.status = 200;
      ctx.type = "application/json";
      ctx.body = {
        success: false,
        data: null,
        error: {
          code: err.code || err.name || "INTERNAL_ERROR",
          message: err && err.message ? err.message : "Internal Server Error",
          details: err && err.details !== undefined ? err.details : undefined
        }
      };

      ctx.app.emit("error", err, ctx);
    }
  };
}

module.exports = {
  errorHandler
};
