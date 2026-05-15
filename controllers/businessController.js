const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const forge = require("node-forge");
const db = require("../db");
const { loadSchemasFromDatabase } = require("../models/schema");
const { resolveBleDeviceProfile } = require("../services/bleDeviceProfileService");
const { listPresetWaveforms, getModeExplore } = require("../services/modeExploreService");
const { createWaveformCustom, updateWaveformCustom, listWaveformsCustom } = require("../services/waveformsCustomService");
const {
  listAchievementsCatalog,
  listUserAchievementCodes,
  awardAchievementIdempotent,
  evaluateAchievementsAfterUsageRecord,
  recordAndEvaluateAchievementEvent,
  toLocalDateString
} = require("../services/achievementsService");

function apiOk(ctx, data, pagination) {
  ctx.status = 200;
  ctx.body = {
    success: true,
    data,
    error: null,
    pagination: pagination || undefined
  };
}

function apiFail(ctx, code, message, details) {
  ctx.status = 200;
  ctx.body = {
    success: false,
    data: null,
    error: {
      code,
      message,
      details: details !== undefined ? details : undefined
    }
  };
}

function dbOk(data) {
  return { success: true, data };
}

function dbFail(error, code) {
  return { success: false, error: String(error || "Database error"), code };
}

function parseLimitOffset(query, defaults = {}) {
  const limit = Math.max(1, Math.min(200, Number(query.limit) || Number(defaults.limit) || 20));
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
}

function parseSort(query, allowedColumns, defaults = {}) {
  const sortBy = String(query.sortBy || query.orderBy || defaults.sortBy || "");
  const sortOrderRaw = String(query.sortOrder || query.order || defaults.sortOrder || "desc").toLowerCase();
  const sortOrder = sortOrderRaw === "asc" ? "ASC" : "DESC";
  const column = allowedColumns.includes(sortBy) ? sortBy : defaults.sortBy || allowedColumns[0];
  return { sortBy: column, sortOrder };
}

function buildPagination({ total, limit, offset }) {
  const safeTotal = Number(total) || 0;
  const safeLimit = Number(limit) || 20;
  const safeOffset = Number(offset) || 0;
  const page = safeLimit > 0 ? Math.floor(safeOffset / safeLimit) + 1 : 1;
  return {
    total: safeTotal,
    page,
    limit: safeLimit,
    hasNext: safeOffset + safeLimit < safeTotal,
    hasPrev: safeOffset > 0
  };
}

function requireUser(ctx) {
  const payload = ctx.state.user;
  if (!payload) return { ok: false, error: { code: "UNAUTHORIZED", message: "Missing token" } };
  if (payload.type && payload.type !== "user") {
    return { ok: false, error: { code: "FORBIDDEN", message: "User token required" } };
  }
  const userId = payload.sub || payload.userId || payload.id;
  if (!userId) return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid token payload" } };
  return { ok: true, userId: String(userId), payload };
}

async function queryOne(sql, params) {
  try {
    const rows = await db.query(sql, params);
    return dbOk(rows[0]);
  } catch (err) {
    return dbFail(err?.message || err, err?.code);
  }
}

async function queryAll(sql, params) {
  try {
    const rows = await db.query(sql, params);
    return dbOk(rows);
  } catch (err) {
    return dbFail(err?.message || err, err?.code);
  }
}

async function exec(sql, params) {
  try {
    const result = await db.query(sql, params);
    return dbOk(result);
  } catch (err) {
    return dbFail(err?.message || err, err?.code);
  }
}

async function authRegister(ctx) {
  const { username, password } = ctx.request.body || {};
  if (!username || !password) {
    apiFail(ctx, "INVALID_PARAM", "username and password are required");
    return;
  }

  const existing = await queryOne("SELECT id FROM admin WHERE username = ? LIMIT 1", [username]);
  if (!existing.success) {
    apiFail(ctx, "DB_ERROR", existing.error, existing.code ? { code: existing.code } : undefined);
    return;
  }
  if (existing.data) {
    apiFail(ctx, "USERNAME_EXISTS", "Username already exists");
    return;
  }

  const role = "admin";
  const created = await exec("INSERT INTO admin (role, username, password) VALUES (?, ?, ?)", [
    role,
    username,
    password
  ]);
  if (!created.success) {
    apiFail(ctx, "DB_ERROR", created.error, created.code ? { code: created.code } : undefined);
    return;
  }

  apiOk(ctx, { created: true });
}

async function authLogin(ctx) {
  const { username, password } = ctx.request.body || {};
  if (!username || !password) {
    apiFail(ctx, "INVALID_PARAM", "username and password are required");
    return;
  }

  const found = await queryOne("SELECT id, role, username, password FROM admin WHERE username = ? LIMIT 1", [username]);
  if (!found.success) {
    apiFail(ctx, "DB_ERROR", found.error, found.code ? { code: found.code } : undefined);
    return;
  }

  const admin = found.data;
  if (!admin || admin.password !== password) {
    apiFail(ctx, "INVALID_CREDENTIALS", "Invalid username or password");
    return;
  }

  const token = jwt.sign(
    { sub: String(admin.id), role: admin.role, type: "admin", username: admin.username },
    process.env.JWT_SECRET || "change-me",
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  apiOk(ctx, { token });
}

async function authLogout(ctx) {
  apiOk(ctx, { ok: true });
}

async function authRefresh(ctx) {
  apiFail(ctx, "NOT_IMPLEMENTED", "Token refresh is not implemented");
}

async function authSessionRestore(ctx) {
  const payload = ctx.state.user;
  if (!payload) {
    apiFail(ctx, "UNAUTHORIZED", "Missing token");
    return;
  }
  apiOk(ctx, { valid: true, user: payload });
}

async function authMe(ctx) {
  const payload = ctx.state.user;
  if (!payload) {
    apiFail(ctx, "UNAUTHORIZED", "Missing token");
    return;
  }
  apiOk(ctx, payload);
}

async function authLoginWechat(ctx) {
  apiFail(ctx, "NOT_IMPLEMENTED", "Wechat login is not implemented");
}

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return "";
}

function parsePemFromEnv(envValue) {
  const raw = String(envValue || "").trim();
  if (!raw) return "";
  if (raw.includes("-----BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (decoded.includes("-----BEGIN")) return decoded;
  } catch {}
  return raw;
}

function loadRsaPrivateKeyFromEnv(envValue, passphrase) {
  const raw = String(envValue || "").trim();
  if (!raw) return null;

  const pemCandidate = parsePemFromEnv(raw);
  if (pemCandidate.includes("-----BEGIN")) {
    try {
      return crypto.createPrivateKey({ key: pemCandidate, passphrase: passphrase || undefined });
    } catch {
      return null;
    }
  }

  const compactB64 = raw.replace(/\s+/g, "");
  try {
    const der = Buffer.from(compactB64, "base64");
    if (der.length > 0) {
      try {
        return crypto.createPrivateKey({
          key: der,
          format: "der",
          type: "pkcs1",
          passphrase: passphrase || undefined
        });
      } catch {}

      try {
        return crypto.createPrivateKey({
          key: der,
          format: "der",
          type: "pkcs8",
          passphrase: passphrase || undefined
        });
      } catch {}
    }
  } catch {}

  return null;
}

function loadForgeRsaPrivateKeyFromEnv(envValue, passphrase) {
  const raw = String(envValue || "").trim();
  if (!raw) return null;

  let pemCandidate = parsePemFromEnv(raw);
  if (!pemCandidate.includes("-----BEGIN")) {
    const keyObject = loadRsaPrivateKeyFromEnv(raw, passphrase);
    if (!keyObject) return null;
    try {
      pemCandidate = keyObject.export({ format: "pem", type: "pkcs1" });
    } catch {
      try {
        pemCandidate = keyObject.export({ format: "pem", type: "pkcs8" });
      } catch {
        return null;
      }
    }
    pemCandidate = typeof pemCandidate === "string" ? pemCandidate : Buffer.from(pemCandidate).toString("utf8");
  }

  try {
    if (passphrase) {
      const decrypted = forge.pki.decryptRsaPrivateKey(pemCandidate, passphrase);
      if (decrypted) return decrypted;
    }
    return forge.pki.privateKeyFromPem(pemCandidate);
  } catch {
    return null;
  }
}

function getClientIp(ctx) {
  const xff = String(ctx.get("x-forwarded-for") || "").trim();
  if (xff) return xff.split(",")[0].trim();
  return String(ctx.ip || "").trim();
}

async function verifyJiguangLoginToken({ loginToken, exID, ip }) {
  const appKey = pickEnv("JIGUANG_APPKEY", "JIGUANG_APP_KEY", "JIGUANG_APPKEY_ID");
  const masterSecret = pickEnv("JIGUANG_MASTER_SECRET", "JIGUANG_MASTERSECRET");
  const privateKeyRaw = pickEnv("JIGUANG_RSA_PRIVATE_KEY", "JIGUANG_PRIVATE_KEY", "JIGUANG_RSA_PRIVATE_KEY_PEM");
  const privateKeyPassphrase = pickEnv("JIGUANG_RSA_PRIVATE_KEY_PASSPHRASE", "JIGUANG_PRIVATE_KEY_PASSPHRASE");
  const privateKey = loadForgeRsaPrivateKeyFromEnv(privateKeyRaw, privateKeyPassphrase);

  if (!appKey) return { success: false, code: "CONFIG_MISSING", error: "Missing JIGUANG_APPKEY" };
  if (!masterSecret) return { success: false, code: "CONFIG_MISSING", error: "Missing JIGUANG_MASTER_SECRET" };
  if (!privateKeyRaw) return { success: false, code: "CONFIG_MISSING", error: "Missing JIGUANG_RSA_PRIVATE_KEY" };
  if (!privateKey) return { success: false, code: "CONFIG_INVALID", error: "Invalid JIGUANG_RSA_PRIVATE_KEY" };

  const timeoutMs = Number(pickEnv("JIGUANG_HTTP_TIMEOUT_MS") || 5000);
  const retry = Math.max(0, Number(pickEnv("JIGUANG_HTTP_RETRY") || 0));
  const version = String(pickEnv("JIGUANG_LOGIN_TOKEN_VERIFY_VERSION") || "v2").toLowerCase();

  const urls =
    version === "v1"
      ? ["https://api.verification.jpush.cn/v1/web/loginTokenVerify"]
      : version === "v2"
        ? ["https://api.verification.jpush.cn/v2/web/loginTokenVerify"]
        : ["https://api.verification.jpush.cn/v2/web/loginTokenVerify", "https://api.verification.jpush.cn/v1/web/loginTokenVerify"];

  const auth = Buffer.from(`${appKey}:${masterSecret}`, "utf8").toString("base64");
  const basePayload = { loginToken };
  if (exID) basePayload.exID = exID;

  async function callOnce(url) {
    const payload = { ...basePayload };
    if (url.includes("/v2/") && ip) payload.ip = ip;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        return { ok: false, error: `Invalid response from Jiguang`, details: { status: res.status, body: text.slice(0, 200) } };
      }

      return { ok: true, status: res.status, json };
    } finally {
      clearTimeout(timer);
    }
  }

  let lastError;
  for (const url of urls) {
    for (let attempt = 0; attempt <= retry; attempt += 1) {
      try {
        const r = await callOnce(url);
        if (!r.ok) {
          lastError = r;
          continue;
        }

        const j = r.json || {};
        if (Number(j.code) !== 8000 || !j.phone) {
          return { success: false, code: "JIGUANG_VERIFY_FAILED", data: j };
        }

        let decrypted;
        try {
          const encryptedBytes = forge.util.decode64(String(j.phone || ""));
          const decryptedBytes = privateKey.decrypt(encryptedBytes, "RSAES-PKCS1-V1_5");
          decrypted = Buffer.from(forge.util.decodeUtf8(decryptedBytes), "utf8");
        } catch (err) {
          return { success: false, code: "JIGUANG_DECRYPT_FAILED", error: err?.message || String(err), data: j };
        }

        const phone = String(decrypted.toString("utf8") || "").trim();
        if (!phone) return { success: false, code: "JIGUANG_DECRYPT_FAILED", error: "Empty decrypted phone", data: j };

        return { success: true, data: { phone, score: j.score !== undefined ? j.score : null, code: j.code, exID: j.exID } };
      } catch (err) {
        lastError = { ok: false, error: err?.message || String(err) };
      }
    }
  }

  return { success: false, code: "JIGUANG_REQUEST_FAILED", error: lastError?.error || "Request failed", details: lastError?.details };
}

async function authLoginJiguangVerify(ctx) {
  const { loginToken, exID, ip } = ctx.request.body || {};
  const normalizedToken = loginToken ? String(loginToken).trim() : "";
  if (!normalizedToken) {
    apiFail(ctx, "INVALID_PARAM", "loginToken is required");
    return;
  }

  const clientIp = ip ? String(ip).trim() : getClientIp(ctx);
  const res = await verifyJiguangLoginToken({ loginToken: normalizedToken, exID: exID ? String(exID) : undefined, ip: clientIp });

  if (!res.success) {
    if (res.code === "CONFIG_MISSING") {
      apiFail(ctx, "CONFIG_MISSING", res.error);
      return;
    }
    if (res.code === "CONFIG_INVALID") {
      apiFail(ctx, "CONFIG_INVALID", res.error);
      return;
    }
    if (res.code === "JIGUANG_DECRYPT_FAILED") {
      apiFail(ctx, "JIGUANG_DECRYPT_FAILED", res.error || "Decrypt failed", {
        jiguangCode: res.data?.code,
        exID: res.data?.exID
      });
      return;
    }
    if (res.code === "JIGUANG_VERIFY_FAILED") {
      apiFail(ctx, "JIGUANG_VERIFY_FAILED", res.data?.content || "verify failed", {
        jiguangCode: res.data?.code,
        exID: res.data?.exID,
        id: res.data?.id
      });
      return;
    }

    apiFail(ctx, "JIGUANG_REQUEST_FAILED", res.error || "Request failed", res.details);
    return;
  }

  const phone = String(res.data.phone || "").trim();
  const score = res.data.score !== undefined ? res.data.score : null;
  const code = res.data.code;

  const authProvider = "jiguang";
  const lookupRes = await queryOne("SELECT * FROM users WHERE authProvider = ? AND phone = ? LIMIT 1", [authProvider, phone]);
  if (!lookupRes.success) {
    apiFail(ctx, "DB_ERROR", lookupRes.error, lookupRes.code ? { code: lookupRes.code } : undefined);
    return;
  }

  if (lookupRes.data) {
    const existing = lookupRes.data;
    const token = jwt.sign(
      {
        sub: String(existing.id),
        type: "user",
        authProvider,
        username: existing.username,
        phone: existing.phone || undefined
      },
      process.env.JWT_SECRET || "change-me",
      { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
    );
    apiOk(ctx, { phone, score, code, token, isNewUser: false });
    return;
  }

  const registerToken = issueJiguangRegisterToken({
    phone,
    operator: undefined,
    riskScore: score !== null ? score : undefined
  });
  apiOk(ctx, { phone, score, code, needsComplete: true, registerToken });
}

function issueJiguangRegisterToken({ phone, username, operator, riskScore }) {
  const secret = process.env.JWT_SECRET || "change-me";
  const payload = {
    type: "register",
    provider: "jiguang",
    jti: crypto.randomUUID(),
    phone: phone || undefined,
    username: username || undefined,
    operator: operator || undefined,
    riskScore: riskScore !== undefined ? Number(riskScore) : undefined
  };

  return jwt.sign(payload, secret, { expiresIn: process.env.REGISTER_TOKEN_EXPIRES_IN || "30m" });
}

function verifyJiguangRegisterToken(token) {
  const secret = process.env.JWT_SECRET || "change-me";
  const payload = jwt.verify(String(token || ""), secret);
  if (!payload || typeof payload !== "object") throw new Error("Invalid token payload");
  if (payload.type !== "register" || payload.provider !== "jiguang") throw new Error("Invalid register token");
  return payload;
}

async function authLoginJiguang(ctx) {
  const {
    phone,
    username,
    operator: jiguangOperator,
    riskScore: jiguangRiskScore
  } = ctx.request.body || {};

  const normalizedPhone = phone ? String(phone).trim() : "";
  const normalizedUsername = username ? String(username).trim() : "";
  const loginKey = normalizedPhone || normalizedUsername;
  if (!loginKey) {
    apiFail(ctx, "INVALID_PARAM", "phone or username is required");
    return;
  }

  const authProvider = "jiguang";
  const lookupRes = normalizedPhone
    ? await queryOne("SELECT * FROM users WHERE authProvider = ? AND phone = ? LIMIT 1", [authProvider, normalizedPhone])
    : await queryOne("SELECT * FROM users WHERE authProvider = ? AND username = ? LIMIT 1", [authProvider, normalizedUsername]);

  if (!lookupRes.success) {
    apiFail(ctx, "DB_ERROR", lookupRes.error, lookupRes.code ? { code: lookupRes.code } : undefined);
    return;
  }

  const now = new Date();

  if (!lookupRes.data) {
    const registerToken = issueJiguangRegisterToken({
      phone: normalizedPhone || undefined,
      username: normalizedUsername || undefined,
      operator: jiguangOperator,
      riskScore: jiguangRiskScore
    });
    apiOk(ctx, { needsComplete: true, registerToken });
    return;
  }

  const existing = lookupRes.data;
  const updates = [];
  const values = [];
  if (jiguangOperator !== undefined) {
    updates.push("jiguangOperator = ?");
    values.push(jiguangOperator);
  }
  if (jiguangRiskScore !== undefined) {
    updates.push("jiguangRiskScore = ?");
    values.push(Number(jiguangRiskScore));
  }
  if (updates.length === 0) {
    const token = jwt.sign(
      {
        sub: String(existing.id),
        type: "user",
        authProvider,
        username: existing.username,
        phone: existing.phone || undefined
      },
      process.env.JWT_SECRET || "change-me",
      { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
    );
    apiOk(ctx, { token, isNewUser: false });
    return;
  }
  updates.push("updatedAt = ?");
  values.push(now);
  values.push(existing.id);

  const updated = await exec(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
  if (!updated.success) {
    apiFail(ctx, "DB_ERROR", updated.error, updated.code ? { code: updated.code } : undefined);
    return;
  }

  const token = jwt.sign(
    {
      sub: String(existing.id),
      type: "user",
      authProvider,
      username: existing.username,
      phone: existing.phone || undefined
    },
    process.env.JWT_SECRET || "change-me",
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );
  apiOk(ctx, { token, isNewUser: false });
}

async function authRegisterJiguangComplete(ctx) {
  const body = ctx.request.body || {};
  const bearer = String(ctx.headers.authorization || "").trim();
  const tokenFromHeader = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
  const { registerToken, nickname, avatar, avatar_Url, birthDate } = body;
  const normalizedRegisterToken = String(registerToken || "").trim();
  const finalRegisterToken = normalizedRegisterToken || tokenFromHeader;
  const fallbackLoginToken = String(body.loginToken || "").trim();
  const fallbackExID = body.exID !== undefined && body.exID !== null ? String(body.exID) : undefined;
  const fallbackIp = body.ip ? String(body.ip).trim() : "";
  if (!finalRegisterToken && !fallbackLoginToken) {
    apiFail(ctx, "INVALID_PARAM", "registerToken or loginToken is required");
    return;
  }

  const normalizedNickname = String(nickname || "").trim();
  const normalizedAvatar = avatar !== undefined && avatar !== null ? String(avatar).trim() : "";
  const normalizedAvatarUrl = String(avatar_Url || "").trim();
  const normalizedBirthDate = String(birthDate || "").trim();
  if (!normalizedNickname) {
    apiFail(ctx, "INVALID_PARAM", "nickname is required");
    return;
  }
  if (!normalizedAvatarUrl) {
    apiFail(ctx, "INVALID_PARAM", "avatar_Url is required");
    return;
  }
  if (!normalizedBirthDate) {
    apiFail(ctx, "INVALID_PARAM", "birthDate is required");
    return;
  }

  let payload;
  if (finalRegisterToken) {
    try {
      payload = verifyJiguangRegisterToken(finalRegisterToken);
    } catch (err) {
      apiFail(ctx, "INVALID_PARAM", err?.message || "Invalid registerToken");
      return;
    }
  } else {
    const clientIp = fallbackIp || getClientIp(ctx);
    const res = await verifyJiguangLoginToken({ loginToken: fallbackLoginToken, exID: fallbackExID, ip: clientIp });
    if (!res.success) {
      if (res.code === "CONFIG_MISSING") {
        apiFail(ctx, "CONFIG_MISSING", res.error);
        return;
      }
      if (res.code === "CONFIG_INVALID") {
        apiFail(ctx, "CONFIG_INVALID", res.error);
        return;
      }
      if (res.code === "JIGUANG_DECRYPT_FAILED") {
        apiFail(ctx, "JIGUANG_DECRYPT_FAILED", res.error || "Decrypt failed", {
          jiguangCode: res.data?.code,
          exID: res.data?.exID
        });
        return;
      }
      if (res.code === "JIGUANG_VERIFY_FAILED") {
        apiFail(ctx, "JIGUANG_VERIFY_FAILED", res.data?.content || "verify failed", {
          jiguangCode: res.data?.code,
          exID: res.data?.exID,
          id: res.data?.id
        });
        return;
      }

      apiFail(ctx, "JIGUANG_REQUEST_FAILED", res.error || "Request failed", res.details);
      return;
    }

    payload = {
      type: "register",
      provider: "jiguang",
      jti: crypto.randomUUID(),
      phone: res.data.phone,
      operator: undefined,
      riskScore: res.data.score !== undefined ? Number(res.data.score) : undefined
    };
  }

  const authProvider = "jiguang";
  const tokenPhone = payload.phone ? String(payload.phone).trim() : "";
  const tokenUsername = payload.username ? String(payload.username).trim() : "";
  const finalUsername = tokenUsername || tokenPhone;
  if (!finalUsername) {
    apiFail(ctx, "INVALID_PARAM", "registerToken missing phone/username");
    return;
  }

  const existingRes = tokenPhone
    ? await queryOne("SELECT * FROM users WHERE authProvider = ? AND phone = ? LIMIT 1", [authProvider, tokenPhone])
    : await queryOne("SELECT * FROM users WHERE authProvider = ? AND username = ? LIMIT 1", [authProvider, finalUsername]);
  if (!existingRes.success) {
    apiFail(ctx, "DB_ERROR", existingRes.error, existingRes.code ? { code: existingRes.code } : undefined);
    return;
  }

  if (existingRes.data) {
    const existing = existingRes.data;
    const token = jwt.sign(
      {
        sub: String(existing.id),
        type: "user",
        authProvider,
        username: existing.username,
        phone: existing.phone || undefined
      },
      process.env.JWT_SECRET || "change-me",
      { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
    );
    apiOk(ctx, { token, isNewUser: false });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const inserted = await exec(
    "INSERT INTO users (id, nickname, username, authProvider, phone, phoneVerified, preferences, status, jiguangOperator, jiguangRiskScore, avatar, avatar_Url, birthDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      normalizedNickname,
      finalUsername,
      authProvider,
      tokenPhone || null,
      tokenPhone ? 1 : 0,
      "active",
      payload.operator || null,
      payload.riskScore !== undefined ? Number(payload.riskScore) : null,
      normalizedAvatar || null,
      normalizedAvatarUrl || null,
      normalizedBirthDate || null,
      now,
      now
    ]
  );
  if (!inserted.success) {
    apiFail(ctx, "DB_ERROR", inserted.error, inserted.code ? { code: inserted.code } : undefined);
    return;
  }

  const token = jwt.sign(
    { sub: String(id), type: "user", authProvider, username: finalUsername, phone: tokenPhone || undefined },
    process.env.JWT_SECRET || "change-me",
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );
  apiOk(ctx, { token, isNewUser: true });
}

async function getUsersMe(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const row = await queryOne("SELECT * FROM users WHERE id = ? LIMIT 1", [auth.userId]);
  if (!row.success) {
    apiFail(ctx, "DB_ERROR", row.error, row.code ? { code: row.code } : undefined);
    return;
  }
  if (!row.data) {
    apiFail(ctx, "NOT_FOUND", "User not found");
    return;
  }

  apiOk(ctx, { ...row.data, _id: row.data.id });
}

async function patchUsersMe(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const payload = ctx.request.body || {};
  const allowed = [
    "nickname",
    "phone",
    "phoneVerified",
    "preferences",
    "status",
    "avatar",
    "avatar_Url",
    "birthDate"
  ];

  const keys = Object.keys(payload).filter((k) => allowed.includes(k) && payload[k] !== undefined);
  if (keys.length === 0) {
    apiFail(ctx, "INVALID_PARAM", "No valid fields to update");
    return;
  }

  const setSql = keys.map((k) => `\`${k}\` = ?`).join(", ");
  const values = keys.map((k) => payload[k]);
  values.push(auth.userId);

  const updated = await exec(`UPDATE users SET ${setSql} WHERE id = ?`, values);
  if (!updated.success) {
    apiFail(ctx, "DB_ERROR", updated.error, updated.code ? { code: updated.code } : undefined);
    return;
  }

  const row = await queryOne("SELECT * FROM users WHERE id = ? LIMIT 1", [auth.userId]);
  if (!row.success) {
    apiFail(ctx, "DB_ERROR", row.error, row.code ? { code: row.code } : undefined);
    return;
  }

  apiOk(ctx, row.data ? { ...row.data, _id: row.data.id } : null);
}

async function getSystemAvatars(ctx) {
  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 100 });
  const totalRes = await queryOne("SELECT COUNT(*) AS total FROM sys_profilephoto WHERE isPublished = 1", []);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll(
    "SELECT * FROM sys_profilephoto WHERE isPublished = 1 ORDER BY createTime DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  const baseUrl = process.env.BASE_URL || process.env.PUBLIC_BASE_URL || `${ctx.protocol}://${ctx.host}`;
  const urls = listRes.data
    .map((r) => {
      const publicUrl = r?.publicUrl ? String(r.publicUrl).trim() : "";
      if (publicUrl) return publicUrl;
      const url = r?.url ? String(r.url).trim() : "";
      if (!url) return "";
      if (/^https?:\/\//i.test(url)) return url;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return `${baseUrl}/${url}`;
    })
    .filter(Boolean);

  apiOk(ctx, urls, buildPagination({ total: totalRes.data.total, limit, offset }));
}

async function appResolveBleDeviceProfile(ctx) {
  const raw = ctx.query?.bleName;
  const bleName = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!bleName) {
    ctx.status = 200;
    ctx.body = { success: false, data: null, error: { code: "BAD_REQUEST", message: "bleName is required" } };
    return;
  }
  if (bleName.length > 64) {
    ctx.status = 200;
    ctx.body = { success: false, data: null, error: { code: "BAD_REQUEST", message: "bleName is too long" } };
    return;
  }

  try {
    const resolved = await resolveBleDeviceProfile({ bleName });
    if (!resolved.ok) {
      ctx.status = 200;
      ctx.body = { success: false, data: null, error: { code: resolved.code, message: resolved.message } };
      return;
    }
    ctx.status = 200;
    ctx.body = { success: true, data: resolved.data, error: null };
  } catch (err) {
    ctx.status = 200;
    ctx.body = { success: false, data: null, error: { code: "INTERNAL_ERROR", message: err?.message || String(err) } };
  }
}

async function getSystemLiquidsettingsGap(ctx) {
  const listRes = await queryAll(
    "SELECT id, name, type, gap, total FROM sys_liquidsetting WHERE type = 'gap' ORDER BY updateTime DESC, createTime DESC",
    []
  );
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(ctx, listRes.data);
}

async function getSystemLiquidsettingsTotal(ctx) {
  const listRes = await queryAll(
    "SELECT id, name, type, gap, total FROM sys_liquidsetting WHERE type = 'total' ORDER BY updateTime DESC, createTime DESC",
    []
  );
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(ctx, listRes.data);
}

async function getUsersMeLiquidsetting(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const rowRes = await queryOne(
    `SELECT 
      u.id AS userLiquidsettingId,
      u.userid,
      u.liquidsettingId,
      u.createTime,
      u.updateTime,
      s.id AS sysId,
      s.name AS sysName,
      s.type AS sysType,
      s.gap AS sysGap,
      s.total AS sysTotal
    FROM user_liquidsetting u
    INNER JOIN sys_liquidsetting s ON s.id = u.liquidsettingId
    WHERE u.userid = ?
    ORDER BY u.updateTime DESC, u.createTime DESC
    LIMIT 1`,
    [auth.userId]
  );
  if (!rowRes.success) {
    apiFail(ctx, "DB_ERROR", rowRes.error, rowRes.code ? { code: rowRes.code } : undefined);
    return;
  }
  if (!rowRes.data) {
    apiOk(ctx, null);
    return;
  }

  apiOk(ctx, {
    id: rowRes.data.userLiquidsettingId,
    userid: rowRes.data.userid,
    liquidsettingId: rowRes.data.liquidsettingId,
    system: { id: rowRes.data.sysId, name: rowRes.data.sysName, type: rowRes.data.sysType, gap: rowRes.data.sysGap, total: rowRes.data.sysTotal }
  });
}

async function postUsersMeLiquidsetting(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const liquidsettingId = String(ctx.request.body?.liquidsettingId || "").trim();
  if (!liquidsettingId) {
    apiFail(ctx, "INVALID_PARAM", "liquidsettingId is required");
    return;
  }

  const sysRes = await queryOne("SELECT id, name, type, gap, total FROM sys_liquidsetting WHERE id = ? LIMIT 1", [liquidsettingId]);
  if (!sysRes.success) {
    apiFail(ctx, "DB_ERROR", sysRes.error, sysRes.code ? { code: sysRes.code } : undefined);
    return;
  }
  if (!sysRes.data) {
    apiFail(ctx, "NOT_FOUND", "System liquidsetting not found");
    return;
  }

  const existingRes = await queryOne("SELECT id FROM user_liquidsetting WHERE userid = ? ORDER BY updateTime DESC LIMIT 1", [
    auth.userId
  ]);
  if (!existingRes.success) {
    apiFail(ctx, "DB_ERROR", existingRes.error, existingRes.code ? { code: existingRes.code } : undefined);
    return;
  }

  if (!existingRes.data) {
    const id = crypto.randomUUID();
    const inserted = await exec(
      "INSERT INTO user_liquidsetting (id, liquidsettingId, userid, createTime, updateTime) VALUES (?, ?, ?, NOW(), NOW())",
      [id, liquidsettingId, auth.userId]
    );
    if (!inserted.success) {
      apiFail(ctx, "DB_ERROR", inserted.error, inserted.code ? { code: inserted.code } : undefined);
      return;
    }
  } else {
    const updated = await exec("UPDATE user_liquidsetting SET liquidsettingId = ?, updateTime = NOW() WHERE userid = ?", [
      liquidsettingId,
      auth.userId
    ]);
    if (!updated.success) {
      apiFail(ctx, "DB_ERROR", updated.error, updated.code ? { code: updated.code } : undefined);
      return;
    }
  }

  const rowRes = await queryOne(
    `SELECT 
      u.id AS userLiquidsettingId,
      u.userid,
      u.liquidsettingId,
      u.createTime,
      u.updateTime,
      s.id AS sysId,
      s.name AS sysName,
      s.type AS sysType,
      s.gap AS sysGap,
      s.total AS sysTotal
    FROM user_liquidsetting u
    INNER JOIN sys_liquidsetting s ON s.id = u.liquidsettingId
    WHERE u.userid = ?
    ORDER BY u.updateTime DESC, u.createTime DESC
    LIMIT 1`,
    [auth.userId]
  );
  if (!rowRes.success) {
    apiFail(ctx, "DB_ERROR", rowRes.error, rowRes.code ? { code: rowRes.code } : undefined);
    return;
  }

  apiOk(
    ctx,
    rowRes.data
      ? {
          id: rowRes.data.userLiquidsettingId,
          userid: rowRes.data.userid,
          liquidsettingId: rowRes.data.liquidsettingId,
          system: { id: rowRes.data.sysId, name: rowRes.data.sysName, type: rowRes.data.sysType, gap: rowRes.data.sysGap, total: rowRes.data.sysTotal }
        }
      : null
  );
}

async function appGetSystemNicknames(ctx) {
  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 200 });
  const totalRes = await queryOne("SELECT COUNT(*) AS total FROM sys_nickname WHERE isEnable = 1", []);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll("SELECT * FROM sys_nickname WHERE isEnable = 1 ORDER BY updateTime DESC LIMIT ? OFFSET ?", [
    limit,
    offset
  ]);
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(ctx, listRes.data.map((r) => ({ ...r, _id: r.id })), buildPagination({ total: totalRes.data.total, limit, offset }));
}

async function adminListSystemNicknames(ctx) {
  const admin = requireAdmin(ctx);
  if (!admin.ok) {
    apiFail(ctx, admin.error.code, admin.error.message);
    return;
  }

  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 200 });
  const totalRes = await queryOne("SELECT COUNT(*) AS total FROM sys_nickname", []);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll("SELECT * FROM sys_nickname ORDER BY updateTime DESC LIMIT ? OFFSET ?", [limit, offset]);
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(ctx, listRes.data.map((r) => ({ ...r, _id: r.id })), buildPagination({ total: totalRes.data.total, limit, offset }));
}

async function adminToggleSystemNicknameEnable(ctx) {
  const admin = requireAdmin(ctx);
  if (!admin.ok) {
    apiFail(ctx, admin.error.code, admin.error.message);
    return;
  }

  const id = String(ctx.params.id || "").trim();
  if (!id) {
    apiFail(ctx, "INVALID_PARAM", "id is required");
    return;
  }

  const isEnableRaw = ctx.request.body?.isEnable;
  if (isEnableRaw === undefined) {
    apiFail(ctx, "INVALID_PARAM", "isEnable is required");
    return;
  }

  const isEnable = isEnableRaw === true || isEnableRaw === 1 || isEnableRaw === "1" || String(isEnableRaw).toLowerCase() === "true";
  const updated = await exec("UPDATE sys_nickname SET isEnable = ?, updateTime = ? WHERE id = ?", [
    isEnable ? 1 : 0,
    new Date(),
    id
  ]);
  if (!updated.success) {
    apiFail(ctx, "DB_ERROR", updated.error, updated.code ? { code: updated.code } : undefined);
    return;
  }

  apiOk(ctx, { id, isEnable });
}

async function adminCreateSystemNickname(ctx) {
  const admin = requireAdmin(ctx);
  if (!admin.ok) {
    apiFail(ctx, admin.error.code, admin.error.message);
    return;
  }

  const nickname = String(ctx.request.body?.nickname || "").trim();
  if (!nickname) {
    apiFail(ctx, "INVALID_PARAM", "nickname is required");
    return;
  }

  const isEnableRaw = ctx.request.body?.isEnable;
  const isEnable =
    isEnableRaw === undefined ? true : isEnableRaw === true || isEnableRaw === 1 || isEnableRaw === "1" || String(isEnableRaw).toLowerCase() === "true";

  const id = crypto.randomUUID();
  const now = new Date();
  const inserted = await exec("INSERT INTO sys_nickname (id, nickname, isEnable, createTime, updateTime) VALUES (?, ?, ?, ?, ?)", [
    id,
    nickname,
    isEnable ? 1 : 0,
    now,
    now
  ]);
  if (!inserted.success) {
    apiFail(ctx, "DB_ERROR", inserted.error, inserted.code ? { code: inserted.code } : undefined);
    return;
  }

  apiOk(ctx, { id, nickname, isEnable });
}

async function adminImportSystemNicknames(ctx) {
  const admin = requireAdmin(ctx);
  if (!admin.ok) {
    apiFail(ctx, admin.error.code, admin.error.message);
    return;
  }

  const file = ctx.request.files?.file;
  if (!file || !file.filepath) {
    apiFail(ctx, "INVALID_PARAM", "file is required");
    return;
  }

  let xlsx;
  try {
    xlsx = require("xlsx");
  } catch {
    apiFail(ctx, "DEPENDENCY_MISSING", "xlsx dependency is missing");
    return;
  }

  let nicknames = [];
  try {
    const workbook = xlsx.readFile(file.filepath, { cellDates: true });
    const sheetName = workbook.SheetNames?.[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    const rows = sheet ? xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) : [];
    nicknames = rows
      .map((r) => (Array.isArray(r) ? String(r[0] ?? "").trim() : ""))
      .filter((v) => v && v.toLowerCase() !== "nickname" && v !== "昵称");
  } catch (err) {
    apiFail(ctx, "INVALID_FILE", err?.message || "Failed to parse xlsx");
    return;
  } finally {
    try {
      const fs = require("fs/promises");
      await fs.unlink(file.filepath);
    } catch {}
  }

  nicknames = [...new Set(nicknames)];
  if (nicknames.length === 0) {
    apiFail(ctx, "INVALID_PARAM", "No nickname found in file");
    return;
  }

  const existingRes = await queryAll(
    `SELECT nickname FROM sys_nickname WHERE nickname IN (${nicknames.map(() => "?").join(", ")})`,
    nicknames
  );
  if (!existingRes.success) {
    apiFail(ctx, "DB_ERROR", existingRes.error, existingRes.code ? { code: existingRes.code } : undefined);
    return;
  }
  const existingSet = new Set(existingRes.data.map((r) => String(r.nickname || "").trim()).filter(Boolean));
  const toInsert = nicknames.filter((n) => !existingSet.has(n));

  if (toInsert.length === 0) {
    apiOk(ctx, { inserted: 0, skipped: nicknames.length });
    return;
  }

  const now = new Date();
  const values = [];
  const placeholders = toInsert.map(() => "(?, ?, ?, ?, ?)").join(", ");
  for (const nickname of toInsert) {
    values.push(crypto.randomUUID(), nickname, 1, now, now);
  }

  const inserted = await exec(
    `INSERT INTO sys_nickname (id, nickname, isEnable, createTime, updateTime) VALUES ${placeholders}`,
    values
  );
  if (!inserted.success) {
    apiFail(ctx, "DB_ERROR", inserted.error, inserted.code ? { code: inserted.code } : undefined);
    return;
  }

  apiOk(ctx, { inserted: toInsert.length, skipped: nicknames.length - toInsert.length });
}

async function getArticles(ctx) {
  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 20 });
  const { sortBy, sortOrder } = parseSort(ctx.query, ["publishDate", "createdAt", "updatedAt", "viewCount"], {
    sortBy: "publishDate",
    sortOrder: "desc"
  });

  const where = ["(isPublished = 1 OR status = 'published')"];
  const params = [];

  const totalRes = await queryOne(`SELECT COUNT(*) AS total FROM articles WHERE ${where.join(" AND ")}`, params);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll(
    `SELECT * FROM articles WHERE ${where.join(" AND ")} ORDER BY \`${sortBy}\` ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(
    ctx,
    listRes.data.map((r) => ({ ...r, _id: r.id })),
    buildPagination({ total: totalRes.data.total, limit, offset })
  );
}

async function getArticleById(ctx) {
  const id = ctx.params.id;
  if (!id) {
    apiFail(ctx, "INVALID_PARAM", "id is required");
    return;
  }

  await exec("UPDATE articles SET viewCount = COALESCE(viewCount, 0) + 1 WHERE id = ?", [id]);
  const rowRes = await queryOne("SELECT * FROM articles WHERE id = ? LIMIT 1", [id]);
  if (!rowRes.success) {
    apiFail(ctx, "DB_ERROR", rowRes.error, rowRes.code ? { code: rowRes.code } : undefined);
    return;
  }
  if (!rowRes.data) {
    apiFail(ctx, "NOT_FOUND", "Document not found");
    return;
  }

  apiOk(ctx, { ...rowRes.data, _id: rowRes.data.id });
}

async function getArticlesByCategory(ctx) {
  const category = ctx.params.category;
  if (!category) {
    apiFail(ctx, "INVALID_PARAM", "category is required");
    return;
  }

  apiFail(ctx, "SCHEMA_MISSING", "articles.category is missing, cannot query by category");
}

async function searchArticles(ctx) {
  const q = String(ctx.query.q || "").trim();
  if (!q) {
    apiFail(ctx, "INVALID_PARAM", "q is required");
    return;
  }

  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 20 });
  const like = `%${q}%`;
  const params = [like, like, like];
  const totalRes = await queryOne(
    "SELECT COUNT(*) AS total FROM articles WHERE (isPublished = 1 OR status = 'published') AND (title LIKE ? OR excerpt LIKE ? OR content LIKE ?)",
    params
  );
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll(
    "SELECT * FROM articles WHERE (isPublished = 1 OR status = 'published') AND (title LIKE ? OR excerpt LIKE ? OR content LIKE ?) ORDER BY publishDate DESC LIMIT ? OFFSET ?",
    [...params, limit, offset]
  );
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(
    ctx,
    listRes.data.map((r) => ({ ...r, _id: r.id })),
    buildPagination({ total: totalRes.data.total, limit, offset })
  );
}

async function getAdsNewProducts(ctx) {
  const rowRes = await queryOne(
    "SELECT * FROM ads_new_products WHERE status = 'pushed' ORDER BY createdAt DESC LIMIT 1",
    []
  );
  if (!rowRes.success) {
    apiFail(ctx, "DB_ERROR", rowRes.error, rowRes.code ? { code: rowRes.code } : undefined);
    return;
  }
  apiOk(ctx, rowRes.data ? { ...rowRes.data, _id: rowRes.data.id } : null);
}

async function getProducts(ctx) {
  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 20 });
  const allowedSort = ["price", "originalPrice", "rating", "reviews", "createdAt", "updateTime"];
  const { sortBy, sortOrder } = parseSort(ctx.query, allowedSort, { sortBy: "createdAt", sortOrder: "desc" });

  const where = ["isPublished = 1"];
  const params = [];

  const category = String(ctx.query.category || "").trim();
  if (category) {
    where.push("type = ?");
    params.push(category);
  }

  const searchText = String(ctx.query.searchText || "").trim();
  if (searchText) {
    where.push("(name LIKE ? OR description LIKE ?)");
    params.push(`%${searchText}%`, `%${searchText}%`);
  }

  const totalRes = await queryOne(`SELECT COUNT(*) AS total FROM products WHERE ${where.join(" AND ")}`, params);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll(
    `SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY \`${sortBy}\` ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(
    ctx,
    listRes.data.map((r) => ({ ...r, _id: r.id })),
    buildPagination({ total: totalRes.data.total, limit, offset })
  );
}

async function getProductById(ctx) {
  const id = ctx.params.id;
  if (!id) {
    apiFail(ctx, "INVALID_PARAM", "id is required");
    return;
  }

  const rowRes = await queryOne("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
  if (!rowRes.success) {
    apiFail(ctx, "DB_ERROR", rowRes.error, rowRes.code ? { code: rowRes.code } : undefined);
    return;
  }
  if (!rowRes.data) {
    apiFail(ctx, "NOT_FOUND", "Document not found");
    return;
  }

  apiOk(ctx, { ...rowRes.data, _id: rowRes.data.id });
}

async function getMeditationAudios(ctx) {
  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 100 });

  const totalRes = await queryOne("SELECT COUNT(*) AS total FROM audios WHERE isPublished = 1", []);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll(
    "SELECT * FROM audios WHERE isPublished = 1 ORDER BY createTime DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  const items = listRes.data.map((r) => ({
    ...r,
    _id: r.id,
    url: r.publicUrl,
    coverUrl: r.coverUrl || null
  }));

  apiOk(ctx, items, buildPagination({ total: totalRes.data.total, limit, offset }));
}

async function getKegels(ctx) {
  const schemas = await loadSchemasFromDatabase();
  if (!schemas.kegels && !schemas.kegel && !schemas.kegel_programs) {
    apiFail(ctx, "TABLE_MISSING", "Kegels table not found in database");
    return;
  }

  const table = schemas.kegels ? "kegels" : schemas.kegel ? "kegel" : "kegel_programs";
  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 100 });

  const totalRes = await queryOne(`SELECT COUNT(*) AS total FROM \`${table}\` WHERE published = 1`, []);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll(
    `SELECT * FROM \`${table}\` WHERE published = 1 ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(ctx, listRes.data.map((r) => ({ ...r, _id: r.id })), buildPagination({ total: totalRes.data.total, limit, offset }));
}

async function getUsageSummary(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const totalRes = await queryOne("SELECT COALESCE(SUM(duration), 0) AS totalDuration FROM record WHERE user_id = ?", [
    auth.userId
  ]);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const favRes = await queryOne(
    "SELECT mode, COUNT(*) AS cnt FROM record WHERE user_id = ? GROUP BY mode ORDER BY cnt DESC LIMIT 1",
    [auth.userId]
  );
  if (!favRes.success) {
    apiFail(ctx, "DB_ERROR", favRes.error, favRes.code ? { code: favRes.code } : undefined);
    return;
  }

  const lastRes = await queryOne("SELECT MAX(createdAt) AS lastUsedAt FROM record WHERE user_id = ?", [auth.userId]);
  if (!lastRes.success) {
    apiFail(ctx, "DB_ERROR", lastRes.error, lastRes.code ? { code: lastRes.code } : undefined);
    return;
  }

  apiOk(ctx, {
    totalDuration: Number(totalRes.data?.totalDuration || 0),
    favoriteMode: favRes.data?.mode || null,
    lastUsedAt: lastRes.data?.lastUsedAt || null
  });
}

async function getUsageRecords(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 20 });
  const totalRes = await queryOne("SELECT COUNT(*) AS total FROM record WHERE user_id = ?", [auth.userId]);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll(
    "SELECT * FROM record WHERE user_id = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?",
    [auth.userId, limit, offset]
  );
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(
    ctx,
    listRes.data.map((r) => ({ ...r, _id: r.id })),
    buildPagination({ total: totalRes.data.total, limit, offset })
  );
}

async function getUsageStats(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const granularityRaw = String(ctx.query?.granularity || ctx.query?.period || "week").trim().toLowerCase();
  const granularity = granularityRaw === "month" || granularityRaw === "monthly" ? "month" : "week";

  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 12 });
  const limitSafe = Math.max(1, Math.min(60, Number(limit) || 12));
  const offsetSafe = Math.max(0, Number(offset) || 0);

  const bucketExpr = granularity === "month" ? "DATE_FORMAT(createdAt, '%Y-%m')" : "YEARWEEK(createdAt, 3)";

  const totalRes = await queryAll(
    `SELECT ${bucketExpr} AS bucket, COUNT(*) AS total
     FROM record
     WHERE user_id = ?
     GROUP BY bucket
     ORDER BY bucket DESC
     LIMIT ? OFFSET ?`,
    [auth.userId, limitSafe, offsetSafe]
  );
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const totals = totalRes.data || [];
  const bucketKeys = totals.map((r) => r.bucket).filter((x) => x !== null && x !== undefined);
  const buckets = totals.map((r) => ({ bucket: r.bucket, totalCount: Number(r.total) || 0, waveforms: [] }));
  const bucketMap = new Map(buckets.map((b) => [b.bucket, b]));

  if (bucketKeys.length > 0) {
    const waveformKeyExpr =
      "CASE " +
      "WHEN mode_note IS NULL OR mode_note = '' THEN NULL " +
      "WHEN INSTR(mode_note, ':') > 0 THEN SUBSTRING_INDEX(mode_note, ':', -1) " +
      "ELSE mode_note " +
      "END";

    const inPlaceholders = bucketKeys.map(() => "?").join(", ");
    const waveformRes = await queryAll(
      `SELECT ${bucketExpr} AS bucket, ${waveformKeyExpr} AS waveformKey, COUNT(*) AS total
       FROM record
       WHERE user_id = ? AND mode = 'waveform' AND mode_note IS NOT NULL AND mode_note <> ''
         AND ${bucketExpr} IN (${inPlaceholders})
       GROUP BY bucket, waveformKey
       ORDER BY bucket DESC, total DESC`,
      [auth.userId, ...bucketKeys]
    );
    if (!waveformRes.success) {
      apiFail(ctx, "DB_ERROR", waveformRes.error, waveformRes.code ? { code: waveformRes.code } : undefined);
      return;
    }

    for (const row of waveformRes.data || []) {
      const b = bucketMap.get(row.bucket);
      if (!b) continue;
      b.waveforms.push({ waveformKey: row.waveformKey, count: Number(row.total) || 0 });
    }
  }

  apiOk(ctx, { granularity, buckets });
}

async function postUsageRecords(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const { duration, mode, mode_note, modeNote, toy_id, used_at } = ctx.request.body || {};
  if (duration === undefined || !mode) {
    apiFail(ctx, "INVALID_PARAM", "duration and mode are required");
    return;
  }

  const rawNote = mode_note !== undefined ? mode_note : modeNote;
  const note =
    rawNote === null || rawNote === undefined
      ? null
      : (() => {
          const s = String(rawNote).trim();
          if (!s) return null;
          return s.length > 50 ? s.slice(0, 50) : s;
        })();

  const id = crypto.randomUUID();
  const createdAt = used_at ? new Date(used_at) : new Date();

  const inserted = await exec(
    "INSERT INTO record (id, mode, mode_note, user_id, toy_id, duration, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, mode, note, auth.userId, toy_id || null, Number(duration), createdAt]
  );
  if (!inserted.success) {
    apiFail(ctx, "DB_ERROR", inserted.error, inserted.code ? { code: inserted.code } : undefined);
    return;
  }

  try {
    await evaluateAchievementsAfterUsageRecord({
      userId: auth.userId,
      record: {
        id,
        durationSec: Number(duration) || 0,
        usedAtMs: createdAt.getTime(),
        localDate: toLocalDateString(createdAt),
        mode: mode || null,
        toyId: toy_id || null
      }
    });
  } catch (err) {
    console.error("[Achievements] Error in postUsageRecords evaluation:", err);
  }

  apiOk(ctx, id);
}

async function getAchievementsCatalog(ctx) {
  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 200 });
  const totalRes = await queryOne("SELECT COUNT(*) AS total FROM achievements", []);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  try {
    const items = await listAchievementsCatalog({ limit, offset });
    apiOk(ctx, items, buildPagination({ total: totalRes.data.total, limit, offset }));
  } catch (err) {
    apiFail(ctx, "DB_ERROR", err?.message || String(err));
  }
}

async function getAchievementsMyCodes(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  try {
    const codes = await listUserAchievementCodes({ userId: auth.userId });
    apiOk(ctx, codes);
  } catch (err) {
    apiFail(ctx, "DB_ERROR", err?.message || String(err));
  }
}

async function postAchievementsAward(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const { code, context } = ctx.request.body || {};
  if (!code) {
    apiFail(ctx, "INVALID_PARAM", "code is required");
    return;
  }

  try {
    const res = await awardAchievementIdempotent({
      userId: auth.userId,
      code: String(code),
      context: context && typeof context === "object" ? context : context !== undefined ? { value: context } : null,
      reason: { type: "manual_award_request" }
    });
    if (!res.ok) {
      apiFail(ctx, res.error.code, res.error.message);
      return;
    }
    apiOk(ctx, { awarded: !!res.awarded });
  } catch (err) {
    apiFail(ctx, "DB_ERROR", err?.message || String(err));
  }
}

async function postAchievementsEvents(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const { eventType, dedupeKey, payload } = ctx.request.body || {};
  const eventTypeStr = String(eventType || "").trim();
  if (!eventTypeStr) {
    apiFail(ctx, "INVALID_PARAM", "eventType is required");
    return;
  }

  try {
    const res = await recordAndEvaluateAchievementEvent({
      userId: auth.userId,
      eventType: eventTypeStr,
      dedupeKey: dedupeKey ? String(dedupeKey) : null,
      payload: payload && typeof payload === "object" ? payload : payload !== undefined ? { value: payload } : null
    });
    apiOk(ctx, { inserted: !!res.inserted, awardedCodes: res.awardedCodes || [] });
  } catch (err) {
    apiFail(ctx, "DB_ERROR", err?.message || String(err));
  }
}

async function getWaveformsPreset(ctx) {
  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 200 });
  try {
    const res = await listPresetWaveforms({ limit, offset });
    apiOk(ctx, res.items, buildPagination({ total: res.total, limit, offset }));
  } catch (err) {
    apiFail(ctx, "DB_ERROR", err?.message || String(err));
  }
}

async function appGetModeExplore(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const includeUnpublishedRaw = ctx.query?.includeUnpublished;
  const includeUnpublished =
    includeUnpublishedRaw === "1" || includeUnpublishedRaw === 1 || includeUnpublishedRaw === true || String(includeUnpublishedRaw || "").toLowerCase() === "true";

  try {
    const data = await getModeExplore({ includeUnpublished });
    apiOk(ctx, { categories: data.categories });
  } catch (err) {
    apiFail(ctx, "DB_ERROR", err?.message || String(err));
  }
}

async function getWaveformsCustom(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 200 });
  try {
    const res = await listWaveformsCustom({ userId: auth.userId, limit, offset });
    apiOk(ctx, res.items, buildPagination({ total: res.total, limit, offset }));
  } catch (err) {
    apiFail(ctx, "DB_ERROR", err?.message || String(err));
  }
}

async function postWaveformsCustom(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const body = ctx.request.body || {};
  const name = String(body.name || "").trim();
  const sequence = body.sequence;
  if (!name || sequence === undefined) {
    apiFail(ctx, "INVALID_PARAM", "name and sequence are required");
    return;
  }

  try {
    const created = await createWaveformCustom({
      userId: auth.userId,
      name,
      sequence,
      tickMs: body.tickMs,
      supportedChannelKeys: body.supportedChannelKeys,
      playPolicy: body.playPolicy,
      minOutputCount: body.minOutputCount,
      sequenceVersion: body.sequenceVersion
    });
    apiOk(ctx, created);
  } catch (err) {
    apiFail(ctx, "DB_ERROR", err?.message || String(err));
  }
}

async function patchWaveformsCustomById(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const id = ctx.params.id;
  if (!id) {
    apiFail(ctx, "INVALID_PARAM", "id is required");
    return;
  }

  const patch = ctx.request.body || {};
  if (!patch || typeof patch !== "object") {
    apiFail(ctx, "INVALID_PARAM", "Invalid body");
    return;
  }

  if (
    patch.name === undefined &&
    patch.sequence === undefined &&
    patch.tickMs === undefined &&
    patch.sequenceVersion === undefined &&
    patch.supportedChannelKeys === undefined &&
    patch.playPolicy === undefined &&
    patch.minOutputCount === undefined
  ) {
    apiFail(ctx, "INVALID_PARAM", "No valid fields to update");
    return;
  }

  try {
    const res = await updateWaveformCustom({ userId: auth.userId, id, patch });
    if (res.notFound) {
      apiFail(ctx, "NOT_FOUND", "Document not found");
      return;
    }
    if (res.notModified) {
      apiOk(ctx, null);
      return;
    }
    apiOk(ctx, res.data);
  } catch (err) {
    apiFail(ctx, "DB_ERROR", err?.message || String(err));
  }
}

async function deleteWaveformsCustomById(ctx) {
  const auth = requireUser(ctx);
  if (!auth.ok) {
    apiFail(ctx, auth.error.code, auth.error.message);
    return;
  }

  const id = ctx.params.id;
  if (!id) {
    apiFail(ctx, "INVALID_PARAM", "id is required");
    return;
  }

  const deleted = await exec("DELETE FROM waveforms_custom WHERE id = ? AND userid = ?", [id, auth.userId]);
  if (!deleted.success) {
    apiFail(ctx, "DB_ERROR", deleted.error, deleted.code ? { code: deleted.code } : undefined);
    return;
  }

  const affected = Number(deleted.data?.affectedRows || 0);
  if (affected === 0) {
    apiFail(ctx, "NOT_FOUND", "Document not found");
    return;
  }

  apiOk(ctx, affected);
}

function requireAdmin(ctx) {
  const payload = ctx.state.user;
  if (!payload) return { ok: false, error: { code: "UNAUTHORIZED", message: "Missing token" } };
  if (payload.type && payload.type !== "admin") {
    return { ok: false, error: { code: "FORBIDDEN", message: "Admin token required" } };
  }
  const adminId = payload.sub || payload.userId || payload.id;
  if (!adminId) return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid token payload" } };
  return { ok: true, adminId: String(adminId), payload };
}

function normalizeAuthModules(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      if (trimmed.startsWith("[") && trimmed.endsWith("]") && trimmed.includes("'")) {
        try {
          const normalized = trimmed.replace(/'/g, '"');
          JSON.parse(normalized);
          return normalized;
        } catch {}
      }

      if (trimmed.includes(",")) {
        const parts = trimmed
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length > 0) return JSON.stringify(parts);
      }

      return null;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function adminUpsertUserAuth(ctx) {
  const admin = requireAdmin(ctx);
  if (!admin.ok) {
    apiFail(ctx, admin.error.code, admin.error.message);
    return;
  }

  const { userid, authModules } = ctx.request.body || {};
  const targetUserId = userid ? String(userid).trim() : "";
  const normalizedAuthModules = normalizeAuthModules(authModules);

  if (!targetUserId) {
    apiFail(ctx, "INVALID_PARAM", "userid is required");
    return;
  }
  if (!normalizedAuthModules) {
    apiFail(ctx, "INVALID_PARAM", "authModules must be valid JSON");
    return;
  }

  const existsRes = await queryOne("SELECT id FROM admin WHERE id = ? LIMIT 1", [targetUserId]);
  if (!existsRes.success) {
    apiFail(ctx, "DB_ERROR", existsRes.error, existsRes.code ? { code: existsRes.code } : undefined);
    return;
  }
  if (!existsRes.data) {
    apiFail(ctx, "NOT_FOUND", "Admin user not found");
    return;
  }

  const currentRes = await queryOne("SELECT id FROM sys_auth WHERE userid = ? LIMIT 1", [targetUserId]);
  if (!currentRes.success) {
    apiFail(ctx, "DB_ERROR", currentRes.error, currentRes.code ? { code: currentRes.code } : undefined);
    return;
  }

  if (!currentRes.data) {
    const id = crypto.randomUUID();
    const inserted = await exec(
      "INSERT INTO sys_auth (id, authModules, userid, createTime, updateTime) VALUES (?, ?, ?, NOW(), NOW())",
      [id, normalizedAuthModules, targetUserId]
    );
    if (!inserted.success) {
      apiFail(ctx, "DB_ERROR", inserted.error, inserted.code ? { code: inserted.code } : undefined);
      return;
    }
    apiOk(ctx, { id, userid: targetUserId, created: true });
    return;
  }

  const updated = await exec("UPDATE sys_auth SET authModules = ?, updateTime = NOW() WHERE userid = ?", [
    normalizedAuthModules,
    targetUserId
  ]);
  if (!updated.success) {
    apiFail(ctx, "DB_ERROR", updated.error, updated.code ? { code: updated.code } : undefined);
    return;
  }
  apiOk(ctx, { id: currentRes.data.id, userid: targetUserId, updated: true });
}

async function adminGetUserAuth(ctx) {
  const admin = requireAdmin(ctx);
  if (!admin.ok) {
    apiFail(ctx, admin.error.code, admin.error.message);
    return;
  }

  const userid = String(ctx.params.userid || "").trim();
  if (!userid) {
    apiFail(ctx, "INVALID_PARAM", "userid is required");
    return;
  }

  const rowRes = await queryOne("SELECT * FROM sys_auth WHERE userid = ? LIMIT 1", [userid]);
  if (!rowRes.success) {
    apiFail(ctx, "DB_ERROR", rowRes.error, rowRes.code ? { code: rowRes.code } : undefined);
    return;
  }
  if (!rowRes.data) {
    apiOk(ctx, null);
    return;
  }

  apiOk(ctx, { ...rowRes.data, _id: rowRes.data.id });
}

async function adminListUserAuth(ctx) {
  const admin = requireAdmin(ctx);
  if (!admin.ok) {
    apiFail(ctx, admin.error.code, admin.error.message);
    return;
  }

  const { limit, offset } = parseLimitOffset(ctx.query, { limit: 50 });
  const totalRes = await queryOne("SELECT COUNT(*) AS total FROM sys_auth", []);
  if (!totalRes.success) {
    apiFail(ctx, "DB_ERROR", totalRes.error, totalRes.code ? { code: totalRes.code } : undefined);
    return;
  }

  const listRes = await queryAll("SELECT * FROM sys_auth ORDER BY updateTime DESC LIMIT ? OFFSET ?", [limit, offset]);
  if (!listRes.success) {
    apiFail(ctx, "DB_ERROR", listRes.error, listRes.code ? { code: listRes.code } : undefined);
    return;
  }

  apiOk(
    ctx,
    listRes.data.map((r) => ({ ...r, _id: r.id })),
    buildPagination({ total: totalRes.data.total, limit, offset })
  );
}

module.exports = {
  authRegister,
  authLogin,
  authLogout,
  authRefresh,
  authSessionRestore,
  authMe,
  authLoginWechat,
  authLoginJiguangVerify,
  authLoginJiguang,
  authRegisterJiguangComplete,
  getUsersMe,
  patchUsersMe,
  getSystemAvatars,
  appResolveBleDeviceProfile,
  getSystemLiquidsettingsGap,
  getSystemLiquidsettingsTotal,
  getUsersMeLiquidsetting,
  postUsersMeLiquidsetting,
  appGetSystemNicknames,
  getArticles,
  getArticleById,
  getArticlesByCategory,
  searchArticles,
  getAdsNewProducts,
  getProducts,
  getProductById,
  getMeditationAudios,
  getKegels,
  getUsageSummary,
  getUsageRecords,
  getUsageStats,
  postUsageRecords,
  getAchievementsCatalog,
  getAchievementsMyCodes,
  postAchievementsAward,
  postAchievementsEvents,
  getWaveformsPreset,
  getWaveformsCustom,
  postWaveformsCustom,
  patchWaveformsCustomById,
  deleteWaveformsCustomById,
  appGetModeExplore,
  adminListSystemNicknames,
  adminToggleSystemNicknameEnable,
  adminCreateSystemNickname,
  adminImportSystemNicknames,
  adminUpsertUserAuth,
  adminGetUserAuth,
  adminListUserAuth
};
