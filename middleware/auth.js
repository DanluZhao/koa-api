const jwt = require("jsonwebtoken");

function authRequired(options = {}) {
  return async (ctx, next) => {
    const header = ctx.get("authorization");
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

    if (!token) {
      ctx.status = 200;
      ctx.body = {
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "Missing Bearer token" }
      };
      return;
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || "change-me");

      const allowedTypes = options.type
        ? Array.isArray(options.type)
          ? options.type.map((t) => String(t))
          : [String(options.type)]
        : null;

      if (allowedTypes && !allowedTypes.includes(String(payload.type || ""))) {
        ctx.status = 200;
        ctx.body = {
          success: false,
          data: null,
          error: { code: "FORBIDDEN", message: "Insufficient token type" }
        };
        return;
      }

      ctx.state.user = payload;
      await next();
    } catch {
      ctx.status = 200;
      ctx.body = {
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "Invalid token" }
      };
    }
  };
}

module.exports = {
  authRequired
};
