const jwt = require("jsonwebtoken");

function authRequired() {
  return async (ctx, next) => {
    const header = ctx.get("authorization");
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

    if (!token) ctx.throw(401, "Missing Bearer token");

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || "change-me");
      ctx.state.user = payload;
      await next();
    } catch {
      ctx.throw(401, "Invalid token");
    }
  };
}

module.exports = {
  authRequired
};
