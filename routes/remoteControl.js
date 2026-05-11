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
const { getModeExplore } = require("../services/modeExploreService");

const htmlPath = path.join(process.cwd(), "remote-control-web", "index.html");
let cachedHtml = null;
try {
  cachedHtml = fsSync.readFileSync(htmlPath, "utf8");
} catch {
  cachedHtml = "<!doctype html><html><head><meta charset=\"utf-8\" /><title>remote-control</title></head><body>missing index.html</body></html>";
}

const webRouter = new Router();
webRouter.get("/remote-control/index.html", async (ctx) => {
  const sessionId = String(ctx.query?.sessionId || "").trim();
  if (sessionId) {
    const q = new URLSearchParams();
    if (ctx.query?.token) q.set("token", String(ctx.query.token));
    if (ctx.query?.baseURL) q.set("baseURL", String(ctx.query.baseURL));
    const qs = q.toString();
    ctx.status = 302;
    ctx.redirect(`/remote-control/${encodeURIComponent(sessionId)}${qs ? `?${qs}` : ""}`);
    return;
  }
  ctx.status = 200;
  ctx.type = "text/html; charset=utf-8";
  ctx.body = cachedHtml;
});
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

const modeExploreCache = new Map();
function getCacheKey({ includeUnpublished }) {
  return includeUnpublished ? "mode-explore:all" : "mode-explore:published";
}
function toAbsoluteUrl(origin, value) {
  const v = value === null || value === undefined ? "" : String(value).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("data:")) return v;
  if (!origin) return v;
  if (v.startsWith("/")) return `${origin}${v}`;
  return `${origin}/${v}`;
}
function normalizeWaveformForH5(origin, wf) {
  const id = wf?.id || wf?._id || wf?.name || "";
  const waveImage = toAbsoluteUrl(origin, wf?.waveImage || wf?.wave_image || wf?.image);
  return {
    ...wf,
    id,
    waveImage
  };
}
function normalizeCategoriesForH5(origin, categories) {
  return (categories || []).map((c) => ({
    id: c.id,
    name: c.name,
    iconUrl: toAbsoluteUrl(origin, c.iconUrl),
    sortOrder: c.sortOrder,
    waveforms: (c.waveforms || []).map((wf) => normalizeWaveformForH5(origin, wf))
  }));
}

async function handleRemoteModeExplore(ctx, sessionId) {
  ctx.params.sessionId = sessionId;
  const s = requireAuthedSession(ctx);
  if (!s.ok) {
    ctx.status = s.status;
    ctx.body = { ok: false, error: "token_invalid" };
    return;
  }

  const includeUnpublishedRaw = ctx.query?.includeUnpublished;
  const includeUnpublished =
    includeUnpublishedRaw === "1" ||
    includeUnpublishedRaw === 1 ||
    includeUnpublishedRaw === true ||
    String(includeUnpublishedRaw || "").toLowerCase() === "true";

  const cacheKey = getCacheKey({ includeUnpublished });
  const cached = modeExploreCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expireAtMs > now) {
    ctx.status = 200;
    ctx.body = cached.body;
    return;
  }

  try {
    const origin = ctx.origin || `${ctx.protocol}://${ctx.host}`;
    const data = await getModeExplore({ includeUnpublished });
    const body = {
      ok: true,
      data: {
        categories: normalizeCategoriesForH5(origin, data.categories),
        version: String(process.env.API_VERSION || "v1"),
        updatedAt: new Date().toISOString()
      }
    };
    modeExploreCache.set(cacheKey, { expireAtMs: now + 10 * 60 * 1000, body });
    ctx.status = 200;
    ctx.body = body;
  } catch {
    ctx.status = 500;
    ctx.body = { ok: false, error: "internal_error" };
  }
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

apiRouter.get("/:sessionId/mode-explore", async (ctx) => {
  await handleRemoteModeExplore(ctx, String(ctx.params.sessionId || "").trim());
});

apiRouter.get("/sessions/:sessionId/mode-explore", async (ctx) => {
  await handleRemoteModeExplore(ctx, String(ctx.params.sessionId || "").trim());
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
