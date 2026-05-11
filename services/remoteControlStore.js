const crypto = require("crypto");

function nowMs() {
  return Date.now();
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function isUuidLike(value) {
  return typeof value === "string" && value.length >= 16;
}

function parseAfterToMs(after, session) {
  if (after === undefined || after === null || after === "") return null;
  const s = String(after).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  if (session && isUuidLike(s)) {
    const found = session.commands.find((c) => c.commandId === s);
    if (found) return found.createdAtMs;
  }
  return null;
}

function validateBleControlPayload(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, message: "payload_invalid" };
  const mode = String(payload.mode || "").trim();
  const valueNum = Number(payload.value);
  if (!Number.isFinite(valueNum)) return { ok: false, message: "value_invalid" };
  const value = Math.floor(valueNum);
  if (mode === "strength") {
    if (value < 0 || value > 100) return { ok: false, message: "strength_out_of_range" };
    return { ok: true, normalized: { mode: "strength", value } };
  }
  if (mode === "gear") {
    if (value < 0 || value > 10) return { ok: false, message: "gear_out_of_range" };
    return { ok: true, normalized: { mode: "gear", value } };
  }
  return { ok: false, message: "mode_invalid" };
}

function getClientIp(ctx) {
  const xf = ctx.get("x-forwarded-for");
  if (xf) return String(xf).split(",")[0].trim();
  return ctx.ip || "";
}

function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();
  return {
    hit(key) {
      const t = nowMs();
      const b = buckets.get(key);
      if (!b || t - b.startMs >= windowMs) {
        buckets.set(key, { startMs: t, count: 1 });
        return { ok: true };
      }
      b.count += 1;
      if (b.count > max) return { ok: false };
      return { ok: true };
    }
  };
}

const sessions = new Map();
const limiter = createRateLimiter({ windowMs: 1000, max: 30 });

function cleanupExpired() {
  const t = nowMs();
  for (const [id, s] of sessions.entries()) {
    if (s.expireAtMs <= t) sessions.delete(id);
  }
}

function getSession(sessionId) {
  cleanupExpired();
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (s.expireAtMs <= nowMs()) {
    sessions.delete(sessionId);
    return null;
  }
  return s;
}

function createSession({ ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  cleanupExpired();
  const sessionId = crypto.randomUUID();
  const token = randomToken();
  const createdAtMs = nowMs();
  const expireAtMs = createdAtMs + ttlMs;
  const session = {
    sessionId,
    token,
    createdAtMs,
    expireAtMs,
    commands: [],
    commandIdSet: new Set()
  };
  sessions.set(sessionId, session);
  return session;
}

function authSessionToken(ctx, session) {
  const token = String(ctx.get("X-Remote-Control-Token") || "").trim();
  if (!token) return { ok: false, status: 401, error: "missing_token" };
  if (token !== session.token) return { ok: false, status: 403, error: "token_invalid" };
  return { ok: true };
}

function normalizeCommandInput(input) {
  const body = input && typeof input === "object" ? input : {};
  const type = String(body.type || "").trim();
  const commandId = body.commandId ? String(body.commandId).trim() : "";
  const tsRaw = body.ts;
  const createdAtMs = Number.isFinite(Number(tsRaw)) ? Math.floor(Number(tsRaw)) : nowMs();
  return { type, commandId, payload: body.payload, createdAtMs };
}

function enqueueCommand(ctx, session, input) {
  const ip = getClientIp(ctx);
  const rl = limiter.hit(`${session.sessionId}:${ip}`);
  if (!rl.ok) return { ok: false, status: 429, error: "rate_limited" };

  const { type, commandId: rawId, payload, createdAtMs } = normalizeCommandInput(input);
  const commandId = rawId || crypto.randomUUID();
  if (session.commandIdSet.has(commandId)) return { ok: true, commandId, deduped: true };

  if (type !== "ble_control") return { ok: false, status: 400, error: "type_invalid" };
  const vp = validateBleControlPayload(payload);
  if (!vp.ok) return { ok: false, status: 400, error: vp.message };

  const command = {
    commandId,
    sessionId: session.sessionId,
    type: "ble_control",
    payload: vp.normalized,
    createdAtMs,
    status: "pending"
  };

  if (vp.normalized.mode === "strength") {
    session.commands = session.commands.filter(
      (c) => !(c.status === "pending" && c.type === "ble_control" && c.payload && c.payload.mode === "strength")
    );
  }

  session.commands.push(command);
  session.commandIdSet.add(commandId);

  if (session.commands.length > 2000) {
    const keep = [];
    for (const c of session.commands) {
      if (c.status === "pending") keep.push(c);
    }
    session.commandIdSet = new Set(keep.map((c) => c.commandId));
    session.commands = keep.slice(-500);
  }

  return { ok: true, commandId, deduped: false };
}

function pullCommands(session, { after } = {}) {
  const afterMs = parseAfterToMs(after, session);
  const list = session.commands
    .filter((c) => c.status === "pending")
    .filter((c) => (afterMs === null ? true : c.createdAtMs > afterMs))
    .sort((a, b) => (a.createdAtMs !== b.createdAtMs ? a.createdAtMs - b.createdAtMs : a.commandId.localeCompare(b.commandId)));
  return list;
}

function ackCommand(session, { commandId, status, error }) {
  const id = String(commandId || "").trim();
  if (!id) return { ok: false, status: 400, error: "commandId_required" };
  const s = String(status || "").trim();
  if (s !== "executed" && s !== "failed") return { ok: false, status: 400, error: "status_invalid" };

  const cmd = session.commands.find((c) => c.commandId === id);
  if (!cmd) return { ok: false, status: 404, error: "command_not_found" };
  cmd.status = s;
  if (s === "failed") cmd.error = error ? String(error).slice(0, 500) : undefined;
  cmd.ackedAtMs = nowMs();
  return { ok: true };
}

module.exports = {
  createSession,
  getSession,
  authSessionToken,
  enqueueCommand,
  pullCommands,
  ackCommand
};

