const Router = require("@koa/router");
const fsSync = require("fs");
const path = require("path");

const {
  createSession,
  getSession,
  authSessionToken,
  enqueueCommand,
  pullCommands,
  ackCommand
} = require("../services/remoteControlStore");

const htmlPath = path.join(process.cwd(), "remote-control-web", "index.html");
let cachedHtml = null;
try {
  cachedHtml = fsSync.readFileSync(htmlPath, "utf8");
} catch {
  cachedHtml = "<!doctype html><html><head><meta charset=\"utf-8\" /><title>remote-control</title></head><body>missing index.html</body></html>";
}

const webRouter = new Router();
webRouter.get("/remote-control/:sessionId", async (ctx) => {
  ctx.status = 200;
  ctx.type = "text/html; charset=utf-8";
  ctx.body = cachedHtml;
});

const apiRouter = new Router({ prefix: "/api/remote-control" });

apiRouter.post("/sessions", async (ctx) => {
  const ttlMs = 24 * 60 * 60 * 1000;
  const session = createSession({ ttlMs });
  ctx.status = 200;
  ctx.body = {
    ok: true,
    sessionId: session.sessionId,
    token: session.token,
    createdAt: new Date(session.createdAtMs).toISOString(),
    expireAt: new Date(session.expireAtMs).toISOString()
  };
});

function requireSession(ctx) {
  const sessionId = String(ctx.params.sessionId || "").trim();
  if (!sessionId) return { ok: false, status: 400, body: { ok: false, error: "bad_request" } };
  const session = getSession(sessionId);
  if (!session) return { ok: false, status: 404, body: { ok: false, error: "session_not_found" } };
  return { ok: true, session };
}

function requireAuthedSession(ctx) {
  const s = requireSession(ctx);
  if (!s.ok) return s;
  const auth = authSessionToken(ctx, s.session);
  if (!auth.ok) return { ok: false, status: auth.status, body: { ok: false, error: auth.error } };
  return s;
}

async function handleCommands(ctx, sessionId, commandBody) {
  ctx.params.sessionId = sessionId;
  const s = requireAuthedSession(ctx);
  if (!s.ok) {
    ctx.status = s.status;
    ctx.body = s.body;
    return;
  }

  const result = enqueueCommand(ctx, s.session, commandBody);
  ctx.status = result.ok ? 200 : result.status;
  ctx.body = result.ok ? { ok: true, commandId: result.commandId } : { ok: false, error: result.error };
}

apiRouter.post("/:sessionId/commands", async (ctx) => {
  await handleCommands(ctx, String(ctx.params.sessionId || "").trim(), ctx.request.body);
});

apiRouter.post("/sessions/:sessionId/commands", async (ctx) => {
  await handleCommands(ctx, String(ctx.params.sessionId || "").trim(), ctx.request.body);
});

apiRouter.post("/commands", async (ctx) => {
  const body = ctx.request.body || {};
  const sessionId = String(body.sessionId || "").trim();
  if (!sessionId) {
    ctx.status = 400;
    ctx.body = { ok: false, error: "sessionId_required" };
    return;
  }
  const { sessionId: _, ...rest } = body;
  await handleCommands(ctx, sessionId, rest);
});

apiRouter.get("/:sessionId/pull", async (ctx) => {
  const s = requireAuthedSession(ctx);
  if (!s.ok) {
    ctx.status = s.status;
    ctx.body = s.body;
    return;
  }

  const after = ctx.query?.after;
  const commands = pullCommands(s.session, { after });
  ctx.status = 200;
  ctx.body = { ok: true, commands };
});

apiRouter.post("/:sessionId/ack", async (ctx) => {
  const s = requireAuthedSession(ctx);
  if (!s.ok) {
    ctx.status = s.status;
    ctx.body = s.body;
    return;
  }
  const body = ctx.request.body || {};
  const result = ackCommand(s.session, body);
  if (!result.ok) {
    ctx.status = result.status;
    ctx.body = result.status === 404 ? { error: "command_not_found" } : { ok: false, error: result.error };
    return;
  }
  ctx.status = 200;
  ctx.body = { ok: true };
});

module.exports = {
  webRouter,
  apiRouter
};
