const crypto = require("crypto");
const db = require("../db");

let schemaPromise = null;

function safeJsonParse(value) {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: true, value };
  const s = value.trim();
  if (!s) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false, value };
  }
}

function jsonStringifySafe(value, maxLen) {
  if (value === null || value === undefined) return null;
  let s;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (!Number.isFinite(Number(maxLen)) || maxLen <= 0) return s;
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.floor(maxLen));
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function toLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDateString(s) {
  if (!s || typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, m: mo, d };
}

function shiftLocalDateString(s, deltaDays) {
  const p = parseLocalDateString(s);
  if (!p) return null;
  const dt = new Date(p.y, p.m - 1, p.d);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDateString(dt);
}

function pickColumn(columns, candidates) {
  for (const c of candidates) {
    if (columns.includes(c)) return c;
  }
  return null;
}

function qIdent(id) {
  return "`" + String(id).replace(/`/g, "``") + "`";
}

async function getTableColumns(tableName) {
  const rows = await db.query(
    "SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [tableName]
  );
  return (rows || []).map((r) => String(r.name));
}

async function resolveSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const [achCols, uaCols, evCols, progCols] = await Promise.all([
        getTableColumns("achievements"),
        getTableColumns("user_achievements"),
        getTableColumns("achievement_events"),
        getTableColumns("user_achievement_progress")
      ]);

      const achievements = {
        table: "achievements",
        id: pickColumn(achCols, ["id"]),
        code: pickColumn(achCols, ["code"]),
        name: pickColumn(achCols, ["name"]),
        description: pickColumn(achCols, ["description"]),
        icon: pickColumn(achCols, ["icon"]),
        iconActive: pickColumn(achCols, ["icon_active", "iconActive"]),
        isActive: pickColumn(achCols, ["isActive", "is_active", "is_active"]),
        conditionType: pickColumn(achCols, ["conditionType", "condition_type"]),
        conditionParams: pickColumn(achCols, ["conditionParams", "condition_params"]),
        createdAt: pickColumn(achCols, ["createdAt", "created_at"])
      };

      const userAchievements = {
        table: "user_achievements",
        id: pickColumn(uaCols, ["id"]),
        userId: pickColumn(uaCols, ["userId", "userid", "user_id"]),
        achievementCode: pickColumn(uaCols, ["achievementCode", "achievement_code", "achievementcode", "code"]),
        earnedAt: pickColumn(uaCols, ["earnedAt", "earned_at"]),
        createdAt: pickColumn(uaCols, ["createdAt", "created_at"]),
        context: pickColumn(uaCols, ["context"])
      };

      const achievementEvents = {
        table: "achievement_events",
        id: pickColumn(evCols, ["id"]),
        userId: pickColumn(evCols, ["userId", "userid", "user_id"]),
        eventType: pickColumn(evCols, ["eventType", "event_type"]),
        achievementCode: pickColumn(evCols, ["achievement_code","achievementCode",  "achievementcode"]),
        dedupeKey: pickColumn(evCols, ["dedupeKey", "dedupe_key"]),
        payload: pickColumn(evCols, ["payload_json","payload"]),
        createdAt: pickColumn(evCols, ["createdAt", "created_at"])
      };

      const achievementProgress = {
        table: "user_achievement_progress",
        id: pickColumn(progCols, ["id"]),
        userId: pickColumn(progCols, ["userId", "userid", "user_id"]),
        achievementCode: pickColumn(progCols, ["achievementCode", "achievement_code", "achievementcode"]),
        progressJson: pickColumn(progCols, ["progressJson", "progress_json"]),
        updatedAt: pickColumn(progCols, ["updatedAt", "updated_at"]),
        createdAt: pickColumn(progCols, ["createdAt", "created_at"])
      };

      const required = [
        achievements.code,
        achievements.isActive,
        achievements.conditionType,
        achievements.conditionParams,
        userAchievements.userId,
        userAchievements.achievementCode
      ];
      if (required.some((x) => !x)) {
        const err = new Error("Achievements schema columns missing");
        err.details = { achievements, userAchievements, achievementEvents, achievementProgress };
        throw err;
      }

      return { achievements, userAchievements, achievementEvents, achievementProgress };
    })();
  }
  return schemaPromise;
}

async function listAchievementsCatalog({ limit, offset }) {
  const schema = await resolveSchema();
  const a = schema.achievements;
  const limitSafe = Math.max(1, Math.min(200, toInt(limit, 200)));
  const offsetSafe = Math.max(0, toInt(offset, 0));

  const iconActiveSel = a.iconActive ? `${qIdent(a.iconActive)} AS icon_active` : "NULL AS icon_active";
  const iconSel = a.icon ? `${qIdent(a.icon)} AS icon` : "NULL AS icon";
  const descSel = a.description ? `${qIdent(a.description)} AS description` : "NULL AS description";
  const nameSel = a.name ? `${qIdent(a.name)} AS name` : "NULL AS name";

  const rows = await db.query(
    `SELECT
      ${qIdent(a.code)} AS code,
      ${nameSel},
      ${descSel},
      ${iconSel},
      ${iconActiveSel},
      ${qIdent(a.isActive)} AS isActive,
      ${qIdent(a.conditionType)} AS conditionType,
      ${qIdent(a.conditionParams)} AS conditionParams
    FROM ${qIdent(a.table)}
    ORDER BY ${qIdent(a.createdAt || a.code)} DESC
    LIMIT ? OFFSET ?`,
    [limitSafe, offsetSafe]
  );

  const items = (rows || []).map((r) => {
    const parsed = safeJsonParse(r.conditionParams);
    return {
      code: r.code,
      name: r.name,
      description: r.description,
      icon: r.icon,
      icon_active: r.icon_active,
      isActive: !!r.isActive,
      conditionType: r.conditionType,
      conditionParams: parsed.ok ? parsed.value : r.conditionParams
    };
  });

  return items;
}

async function listUserAchievementCodes({ userId }) {
  const schema = await resolveSchema();
  const ua = schema.userAchievements;

  const rows = await db.query(
    `SELECT ${qIdent(ua.achievementCode)} AS code
    FROM ${qIdent(ua.table)}
    WHERE ${qIdent(ua.userId)} = ?
    ORDER BY ${qIdent(ua.earnedAt || ua.createdAt || ua.achievementCode)} DESC`,
    [userId]
  );
  return (rows || []).map((r) => String(r.code));
}

async function isAchievementActive({ conn, code }) {
  const schema = await resolveSchema();
  const a = schema.achievements;
  const rows = await conn.query(
    `SELECT ${qIdent(a.code)} AS code
     FROM ${qIdent(a.table)}
     WHERE ${qIdent(a.code)} = ? AND ${qIdent(a.isActive)} = 1
     LIMIT 1`,
    [code]
  );
  const list = rows && rows[0] ? rows[0] : [];
  return !!(list && list[0]);
}

async function insertAchievementEvent({ conn, userId, eventType, achievementCode, dedupeKey, payload }) {
  const schema = await resolveSchema();
  const ev = schema.achievementEvents;
  if (!ev.userId || !ev.eventType) return { inserted: false };

  const id = crypto.randomUUID();
  const payloadStr = jsonStringifySafe(payload, 8000);
  const hasDedupe = dedupeKey !== null && dedupeKey !== undefined && String(dedupeKey).trim() !== "";

  const cols = [];
  const vals = [];
  if (ev.id) {
    cols.push(ev.id);
    vals.push(id);
  }
  cols.push(ev.userId);
  vals.push(userId);
  cols.push(ev.eventType);
  vals.push(String(eventType));

  if (ev.achievementCode) {
    cols.push(ev.achievementCode);
    vals.push(achievementCode ? String(achievementCode) : null);
  }
  if (ev.dedupeKey) {
    cols.push(ev.dedupeKey);
    vals.push(hasDedupe ? String(dedupeKey) : null);
  }
  if (ev.payload) {
    cols.push(ev.payload);
    vals.push(payloadStr);
  }
  if (ev.createdAt) {
    cols.push(ev.createdAt);
    vals.push(new Date());
  }

  const placeholders = cols.map(() => "?").join(", ");
  const sql = hasDedupe
    ? `INSERT IGNORE INTO ${qIdent(ev.table)} (${cols.map(qIdent).join(", ")}) VALUES (${placeholders})`
    : `INSERT INTO ${qIdent(ev.table)} (${cols.map(qIdent).join(", ")}) VALUES (${placeholders})`;

  const result = await conn.query(sql, vals);
  const info = result && result[0] ? result[0] : null;
  const affectedRows = info && typeof info.affectedRows === "number" ? info.affectedRows : 0;
  return { inserted: affectedRows > 0 };
}

async function awardAchievementIdempotent({ userId, code, context, reason }) {
  const schema = await resolveSchema();
  const ua = schema.userAchievements;

  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();

    const active = await isAchievementActive({ conn, code });
    if (!active) {
      await conn.rollback();
      return { ok: false, error: { code: "ACHIEVEMENT_NOT_FOUND", message: "Achievement not found or inactive" } };
    }

    const id = crypto.randomUUID();
    const cols = [];
    const vals = [];
    if (ua.id) {
      cols.push(ua.id);
      vals.push(id);
    }
    cols.push(ua.userId);
    vals.push(userId);
    cols.push(ua.achievementCode);
    vals.push(String(code));
    if (ua.context) {
      cols.push(ua.context);
      vals.push(jsonStringifySafe(context, 2000));
    }
    if (ua.createdAt) {
      cols.push(ua.createdAt);
      vals.push(new Date());
    }
    if (ua.earnedAt) {
      cols.push(ua.earnedAt);
      vals.push(new Date());
    }

    const placeholders = cols.map(() => "?").join(", ");
    const sql = `INSERT IGNORE INTO ${qIdent(ua.table)} (${cols.map(qIdent).join(", ")}) VALUES (${placeholders})`;
    const result = await conn.query(sql, vals);
    const info = result && result[0] ? result[0] : null;
    const affectedRows = info && typeof info.affectedRows === "number" ? info.affectedRows : 0;
    const awarded = affectedRows > 0;

    await insertAchievementEvent({
      conn,
      userId,
      eventType: "achievement_award",
      achievementCode: code,
      dedupeKey: null,
      payload: { code, awarded, reason: reason || null, context: context || null }
    });

    await conn.commit();
    return { ok: true, awarded };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

function normalizeConditionType(value) {
  const s = value === null || value === undefined ? "" : String(value).trim();
  if (!s) return "";
  const withUnderscore = s.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return withUnderscore.replace(/[-\s]+/g, "_").toLowerCase();
}

function extractParamValue(conditionParams, rawString, keys) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  if (conditionParams && typeof conditionParams === "object") {
    for (const k of keyList) {
      const v = conditionParams[k];
      if (v !== undefined && v !== null) return v;
    }
  }

  const s = rawString === null || rawString === undefined ? "" : String(rawString);
  if (!s) return null;
  for (const k of keyList) {
    const re = new RegExp(`"${k}"\\s*:\\s*"([^"]+)"|${k}\\s*[:=]\\s*'([^']+)'|${k}\\s*[:=]\\s*([^,}\\s]+)`, "i");
    const m = re.exec(s);
    if (!m) continue;
    return m[1] || m[2] || m[3] || null;
  }
  return null;
}

async function listActiveAchievementsByConditionTypes(conditionTypes) {
  const schema = await resolveSchema();
  const a = schema.achievements;
  const types = Array.isArray(conditionTypes) ? conditionTypes.map((t) => normalizeConditionType(t)) : [];
  if (types.length === 0) return [];

  const rows = await db.query(
    `SELECT
      ${qIdent(a.code)} AS code,
      ${qIdent(a.conditionType)} AS conditionType,
      ${qIdent(a.conditionParams)} AS conditionParams
     FROM ${qIdent(a.table)}
     WHERE ${qIdent(a.isActive)} = 1`,
    []
  );
  return (rows || [])
    .map((r) => {
      const parsed = safeJsonParse(r.conditionParams);
      return {
        code: String(r.code),
        conditionType: String(r.conditionType),
        conditionTypeNormalized: normalizeConditionType(r.conditionType),
        conditionParams: parsed.ok ? parsed.value : null,
        conditionParamsRaw: r.conditionParams
      };
    })
    .filter((a) => types.includes(a.conditionTypeNormalized));
}

async function hasUserAchievement({ userId, code }) {
  const schema = await resolveSchema();
  const ua = schema.userAchievements;
  const rows = await db.query(
    `SELECT ${qIdent(ua.id || ua.achievementCode)} AS id FROM ${qIdent(ua.table)} WHERE ${qIdent(ua.userId)} = ? AND ${qIdent(ua.achievementCode)} = ? LIMIT 1`,
    [userId, code]
  );
  return !!(rows && rows[0]);
}

async function countUserRecords({ userId, minDurationSec }) {
  const rows = await db.query("SELECT COUNT(*) AS total FROM record WHERE user_id = ? AND duration >= ?", [
    userId,
    Math.max(0, toInt(minDurationSec, 0))
  ]);
  return Number(rows && rows[0] ? rows[0].total : 0) || 0;
}

async function countUserRecordsInWindow({ userId, minDurationSec, weekdayList, startHour, endHour }) {
  const minDur = Math.max(0, toInt(minDurationSec, 0));
  const weekdays = Array.isArray(weekdayList) ? weekdayList.map((x) => toInt(x, -1)).filter((x) => x >= 0 && x <= 6) : [];
  if (weekdays.length === 0) return 0;

  const wh = [];
  const params = [userId, minDur];

  wh.push("user_id = ?");
  wh.push("duration >= ?");
  wh.push(`WEEKDAY(createdAt) IN (${weekdays.map(() => "?").join(", ")})`);
  params.push(...weekdays);

  const s = toInt(startHour, 0);
  const e = toInt(endHour, 24);
  if (e > s) {
    wh.push("HOUR(createdAt) >= ? AND HOUR(createdAt) < ?");
    params.push(s, e);
  } else if (e < s) {
    wh.push("(HOUR(createdAt) >= ? OR HOUR(createdAt) < ?)");
    params.push(s, e);
  }

  const rows = await db.query(`SELECT COUNT(*) AS total FROM record WHERE ${wh.join(" AND ")}`, params);
  return Number(rows && rows[0] ? rows[0].total : 0) || 0;
}

async function countUserRecordsOnMonthDay({ userId, minDurationSec, month, day }) {
  const minDur = Math.max(0, toInt(minDurationSec, 0));
  const m = toInt(month, 0);
  const d = toInt(day, 0);
  if (m < 1 || m > 12 || d < 1 || d > 31) return 0;
  const rows = await db.query(
    "SELECT COUNT(*) AS total FROM record WHERE user_id = ? AND duration >= ? AND MONTH(createdAt) = ? AND DAYOFMONTH(createdAt) = ?",
    [userId, minDur, m, d]
  );
  return Number(rows && rows[0] ? rows[0].total : 0) || 0;
}

async function updateStreakProgress({ userId, achievementCode, localDate, lookbackDays }) {
  const schema = await resolveSchema();
  const prog = schema.achievementProgress;
  if (!prog.userId || !prog.achievementCode || !prog.progressJson) {
    return { streakDays: 0, progressJson: null };
  }

  const conn = await db.pool.getConnection();
  try {
    const cols = [prog.progressJson].filter(Boolean);
    const rows = await conn.query(
      `SELECT ${cols.map(qIdent).join(", ")}
       FROM ${qIdent(prog.table)}
       WHERE ${qIdent(prog.userId)} = ? AND ${qIdent(prog.achievementCode)} = ?
       LIMIT 1`,
      [userId, String(achievementCode)]
    );
    const list = rows && rows[0] ? rows[0] : [];
    const existing = list && list[0] ? list[0] : null;
    const parsed = existing ? safeJsonParse(existing[prog.progressJson]) : { ok: true, value: null };
    const prev = parsed.ok && parsed.value && typeof parsed.value === "object" ? parsed.value : {};

    const set = new Set(Array.isArray(prev.dates) ? prev.dates.map(String) : []);
    set.add(String(localDate));

    const lb = Math.max(1, toInt(lookbackDays, 30));
    const cutoff = shiftLocalDateString(String(localDate), -lb);
    const dates = Array.from(set)
      .filter((d) => (cutoff ? d >= cutoff : true) && d <= String(localDate))
      .sort();

    const datesSet = new Set(dates);
    let streakDays = 0;
    for (let i = 0; i < lb; i += 1) {
      const d = shiftLocalDateString(String(localDate), -i);
      if (!d || !datesSet.has(d)) break;
      streakDays += 1;
    }

    const nextProgress = { streakDays, lastLocalDate: String(localDate), dates };
    const id = crypto.randomUUID();
    const upCols = [];
    const upVals = [];
    if (prog.id) {
      upCols.push(prog.id);
      upVals.push(id);
    }
    upCols.push(prog.userId);
    upVals.push(userId);
    upCols.push(prog.achievementCode);
    upVals.push(String(achievementCode));
    upCols.push(prog.progressJson);
    upVals.push(jsonStringifySafe(nextProgress, 2000));
    if (prog.createdAt) {
      upCols.push(prog.createdAt);
      upVals.push(new Date());
    }
    if (prog.updatedAt) {
      upCols.push(prog.updatedAt);
      upVals.push(new Date());
    }

    const updates = [`${qIdent(prog.progressJson)} = VALUES(${qIdent(prog.progressJson)})`];
    if (prog.updatedAt) {
      updates.push(`${qIdent(prog.updatedAt)} = VALUES(${qIdent(prog.updatedAt)})`);
    }

    const insertSql = `INSERT INTO ${qIdent(prog.table)} (${upCols.map(qIdent).join(", ")}) VALUES (${upCols
      .map(() => "?")
      .join(", ")})
      ON DUPLICATE KEY UPDATE ${updates.join(", ")}`;

    await conn.query(insertSql, upVals);
    return { streakDays, progressJson: nextProgress };
  } finally {
    conn.release();
  }
}

async function evaluateAchievementsAfterUsageRecord({ userId, record }) {
  const codes = [
    "first_toy_use",
    "total_10_sessions",
    "first_30min_session",
    "first_worktime_use",
    "first_valentines_use",
    "streak_5_days"
  ];

  const { id, durationSec, usedAtMs, localDate, mode, toyId } = record || {};
  const payload = {
    recordId: id || null,
    durationSec: Number(durationSec) || 0,
    usedAtMs: Number(usedAtMs) || 0,
    localDate: localDate || null,
    mode: mode || null,
    toyId: toyId || null
  };

  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    await insertAchievementEvent({
      conn,
      userId,
      eventType: "usage_record_created",
      achievementCode: null,
      dedupeKey: id || null,
      payload
    });
    await conn.commit();
  } catch {
    try {
      await conn.rollback();
    } catch {}
  } finally {
    conn.release();
  }

  const achievements = await listActiveAchievementsByConditionTypes([
    "usage_record_first",
    "usage_record_total_count",
    "usage_record_first_min_duration",
    "usage_record_first_in_time_window",
    "usage_record_first_on_date",
    "usage_record_streak"
  ]);

  const byCode = new Map(achievements.map((a) => [a.code, a]));

  const awardedCodes = [];

  for (const code of codes) {
    const a = byCode.get(code);
    if (!a) continue;
    const already = await hasUserAchievement({ userId, code });
    if (already) continue;

    const params = a.conditionParams && typeof a.conditionParams === "object" ? a.conditionParams : {};
    const minValidDurationSec = Math.max(0, toInt(params.minValidDurationSec, 30));
    const durOk = Number(durationSec) >= minValidDurationSec;
    const createdAt = Number.isFinite(Number(usedAtMs)) ? new Date(Number(usedAtMs)) : new Date();
    const hour = createdAt.getHours();
    const month = createdAt.getMonth() + 1;
    const day = createdAt.getDate();
    const weekday0 = (createdAt.getDay() + 6) % 7;

    let shouldAward = false;

    if (a.conditionType === "usage_record_first") {
      if (durOk) {
        const total = await countUserRecords({ userId, minDurationSec: minValidDurationSec });
        shouldAward = total === 1;
      }
    } else if (a.conditionType === "usage_record_total_count") {
      const targetCount = Math.max(1, toInt(params.targetCount, 10));
      if (durOk) {
        const total = await countUserRecords({ userId, minDurationSec: minValidDurationSec });
        shouldAward = total >= targetCount;
      }
    } else if (a.conditionType === "usage_record_first_min_duration") {
      const minDurationSec = Math.max(1, toInt(params.minDurationSec, 1800));
      const total = await countUserRecords({ userId, minDurationSec });
      shouldAward = total >= 1;
    } else if (a.conditionType === "usage_record_first_in_time_window") {
      const weekdays = Array.isArray(params.weekdays) ? params.weekdays : [1, 2, 3, 4, 5];
      const weekdayList = weekdays
        .map((w) => toInt(w, -1))
        .map((w) => (w >= 1 && w <= 7 ? (w + 5) % 7 : w))
        .filter((w) => w >= 0 && w <= 6);
      const startHour = toInt(params.startHour, 9);
      const endHour = toInt(params.endHour, 17);

      const inWeekday = weekdayList.includes(weekday0);
      const inHour = endHour > startHour ? hour >= startHour && hour < endHour : endHour < startHour ? hour >= startHour || hour < endHour : true;

      if (durOk && inWeekday && inHour) {
        const total = await countUserRecordsInWindow({ userId, minDurationSec: minValidDurationSec, weekdayList, startHour, endHour });
        shouldAward = total === 1;
      }
    } else if (a.conditionType === "usage_record_first_on_date") {
      const targetMonth = toInt(params.month, 2);
      const targetDay = toInt(params.day, 14);
      if (durOk && month === targetMonth && day === targetDay) {
        const total = await countUserRecordsOnMonthDay({ userId, minDurationSec: minValidDurationSec, month: targetMonth, day: targetDay });
        shouldAward = total === 1;
      }
    } else if (a.conditionType === "usage_record_streak") {
      const days = Math.max(2, toInt(params.days, 5));
      const lookbackDays = Math.max(days, toInt(params.lookbackDays, 30));
      if (durOk && localDate) {
        const progress = await updateStreakProgress({ userId, achievementCode: code, localDate, lookbackDays });
        shouldAward = progress.streakDays >= days;
      }
    }

    if (!shouldAward) continue;

    const res = await awardAchievementIdempotent({
      userId,
      code,
      context: { trigger: "usage_record_created", usageRecord: payload },
      reason: { type: "usage_record_created", recordId: id || null }
    });
    if (res && res.ok && res.awarded) awardedCodes.push(code);
  }

  return { awardedCodes };
}

async function recordAndEvaluateAchievementEvent({ userId, eventType, dedupeKey, payload }) {
  const schema = await resolveSchema();
  const conn = await db.pool.getConnection();
  let inserted = false;
  try {
    await conn.beginTransaction();
    const r = await insertAchievementEvent({
      conn,
      userId,
      eventType,
      achievementCode: null,
      dedupeKey: dedupeKey || null,
      payload: payload || null
    });
    inserted = !!r.inserted;
    await conn.commit();
  } catch {
    try {
      await conn.rollback();
    } catch {}
  } finally {
    conn.release();
  }

  const achievements = await listActiveAchievementsByConditionTypes(["event_first", "event_distinct_count"]);
  const eventTypeNorm = String(eventType || "").trim().toLowerCase();
  const matched = achievements.filter((a) => {
    const raw = a.conditionParamsRaw;
    const p = a.conditionParams && typeof a.conditionParams === "object" ? a.conditionParams : null;
    const configured = extractParamValue(p, raw, ["eventType", "event_type", "type"]);
    return configured !== null && String(configured).trim().toLowerCase() === eventTypeNorm;
  });

  const awardedCodes = [];

  for (const a of matched) {
    const already = await hasUserAchievement({ userId, code: a.code });
    if (already) continue;
    const raw = a.conditionParamsRaw;
    const p = a.conditionParams && typeof a.conditionParams === "object" ? a.conditionParams : null;
    const typeNorm = normalizeConditionType(a.conditionType);
    if (typeNorm === "event_first") {
      const rows = await db.query(
        `SELECT COUNT(*) AS total FROM ${qIdent(schema.achievementEvents.table)} WHERE ${qIdent(schema.achievementEvents.userId)} = ? AND ${qIdent(
          schema.achievementEvents.eventType
        )} = ?`,
        [userId, String(eventType)]
      );
      const total = Number(rows && rows[0] ? rows[0].total : 0) || 0;
      if (total !== 1) continue;
    } else if (typeNorm === "event_distinct_count") {
      const targetCountRaw = extractParamValue(p, raw, ["targetCount", "target_count", "count"]);
      const targetCount = Math.max(1, toInt(targetCountRaw, 1));
      const dk = schema.achievementEvents.dedupeKey;
      const idCol = schema.achievementEvents.id;
      let countExpr = "COUNT(*)";
      if (dk && idCol) {
        countExpr = `COUNT(DISTINCT COALESCE(NULLIF(${qIdent(dk)}, ''), ${qIdent(idCol)}))`;
      } else if (dk) {
        countExpr = "COUNT(*)";
      }
      const rows = await db.query(
        `SELECT ${countExpr} AS total FROM ${qIdent(schema.achievementEvents.table)} WHERE ${qIdent(schema.achievementEvents.userId)} = ? AND ${qIdent(
          schema.achievementEvents.eventType
        )} = ?`,
        [userId, String(eventType)]
      );
      const total = Number(rows && rows[0] ? rows[0].total : 0) || 0;
      if (total < targetCount) continue;
    } else {
      continue;
    }

    const res = await awardAchievementIdempotent({
      userId,
      code: a.code,
      context: { trigger: "achievement_event", eventType, dedupeKey: dedupeKey || null, payload: payload || null },
      reason: { type: "achievement_event", eventType, inserted }
    });
    if (res && res.ok && res.awarded) awardedCodes.push(a.code);
  }

  return { inserted, awardedCodes };
}

module.exports = {
  listAchievementsCatalog,
  listUserAchievementCodes,
  awardAchievementIdempotent,
  evaluateAchievementsAfterUsageRecord,
  recordAndEvaluateAchievementEvent,
  toLocalDateString
};
