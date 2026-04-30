const crypto = require("crypto");
const db = require("../db");
const { parseJsonField, toPlayableSequence } = require("./modeExploreService");

function normalizeEnum(value, allowed, fallback) {
  const v = value === null || value === undefined ? "" : String(value).trim();
  return allowed.includes(v) ? v : fallback;
}

function normalizePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function normalizeTickMs(value) {
  return normalizePositiveInt(value, 80);
}

function normalizeSupportedChannelKeys(value, fallback) {
  const parsed = parseJsonField(value, null);
  if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  return fallback;
}

function deriveSupportedChannelKeysFromSequenceV1(sequenceV1) {
  const channels = sequenceV1 && typeof sequenceV1 === "object" ? sequenceV1.channels : null;
  if (!Array.isArray(channels)) return null;
  const keys = channels.map((c) => c && typeof c === "object" ? c.key : null).filter((k) => typeof k === "string");
  return keys.length > 0 ? keys : null;
}

function buildSequenceV1FromLegacy({ values, tickMs }) {
  return { v: 1, tickMs, loop: true, channels: [{ key: "suction", values: Array.isArray(values) ? values : [] }] };
}

function buildCustomWaveformPayload({ sequenceInput, tickMsInput, supportedChannelKeysInput, playPolicyInput, minOutputCountInput, sequenceVersionInput }) {
  const playPolicy = normalizeEnum(playPolicyInput, ["ACTIVE_ONLY", "BOTH"], "ACTIVE_ONLY");
  const minOutputCount = normalizePositiveInt(minOutputCountInput, 1);

  if (Array.isArray(sequenceInput)) {
    const tickMs = normalizeTickMs(tickMsInput);
    const sequenceV1 = buildSequenceV1FromLegacy({ values: sequenceInput, tickMs });
    const supportedChannelKeys = normalizeSupportedChannelKeys(supportedChannelKeysInput, ["suction"]) || ["suction"];
    const sequenceVersion = normalizePositiveInt(sequenceVersionInput, 1);

    return {
      tickMs,
      sequenceVersion,
      supportedChannelKeys,
      playPolicy,
      minOutputCount,
      sequenceLegacy: sequenceInput,
      sequenceV1
    };
  }

  const sequenceObj = sequenceInput && typeof sequenceInput === "object" ? sequenceInput : null;
  const tickMs = normalizeTickMs(tickMsInput ?? sequenceObj?.tickMs);
  const sequenceVersion = normalizePositiveInt(sequenceVersionInput ?? sequenceObj?.v, 1);
  const supportedFromSeq = deriveSupportedChannelKeysFromSequenceV1(sequenceObj);
  const supportedChannelKeys = normalizeSupportedChannelKeys(supportedChannelKeysInput, supportedFromSeq || ["suction"]) || ["suction"];

  const channels = Array.isArray(sequenceObj?.channels) ? sequenceObj.channels : [];
  const firstValues = channels.length > 0 && channels[0] && typeof channels[0] === "object" ? channels[0].values : [];
  const sequenceLegacy = Array.isArray(firstValues) ? firstValues : [];

  const sequenceV1 = sequenceObj || buildSequenceV1FromLegacy({ values: sequenceLegacy, tickMs });

  return {
    tickMs,
    sequenceVersion,
    supportedChannelKeys,
    playPolicy,
    minOutputCount,
    sequenceLegacy,
    sequenceV1
  };
}

function normalizeCustomWaveformRow(row) {
  const tickMs = normalizeTickMs(row?.tickMs);
  const sequenceVersion = normalizePositiveInt(row?.sequenceVersion, 1);
  const supportedChannelKeys = normalizeSupportedChannelKeys(row?.supportedChannelKeys, ["suction"]) || ["suction"];
  const playPolicy = normalizeEnum(row?.playPolicy, ["ACTIVE_ONLY", "BOTH"], "ACTIVE_ONLY");
  const minOutputCount = normalizePositiveInt(row?.minOutputCount, 1);

  const sequence = toPlayableSequence({ sequenceJson: row?.sequenceJson, sequence: row?.sequence, tickMs });

  return {
    id: row.id,
    name: row.name,
    tickMs,
    sequenceVersion,
    supportedChannelKeys,
    playPolicy,
    minOutputCount,
    sequence,
    userid: row.userid,
    isPublished: row.isPublished,
    createTime: row.createTime,
    updateTime: row.updateTime,
    _id: row.id
  };
}

async function createWaveformCustom({ userId, name, sequence, tickMs, supportedChannelKeys, playPolicy, minOutputCount, sequenceVersion, query = db.query }) {
  const id = crypto.randomUUID();
  const payload = buildCustomWaveformPayload({
    sequenceInput: sequence,
    tickMsInput: tickMs,
    supportedChannelKeysInput: supportedChannelKeys,
    playPolicyInput: playPolicy,
    minOutputCountInput: minOutputCount,
    sequenceVersionInput: sequenceVersion
  });

  await query(
    `INSERT INTO waveforms_custom
      (id, name, sequence, sequenceJson, tickMs, sequenceVersion, supportedChannelKeys, playPolicy, minOutputCount, userid, isPublished, createTime, updateTime)
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
    [
      id,
      name,
      JSON.stringify(payload.sequenceLegacy),
      JSON.stringify(payload.sequenceV1),
      payload.tickMs,
      payload.sequenceVersion,
      JSON.stringify(payload.supportedChannelKeys),
      payload.playPolicy,
      payload.minOutputCount,
      userId
    ]
  );

  const rows = await query("SELECT * FROM waveforms_custom WHERE id = ? AND userid = ? LIMIT 1", [id, userId]);
  const row = rows && rows[0] ? rows[0] : null;
  if (!row) return null;
  return normalizeCustomWaveformRow(row);
}

async function updateWaveformCustom({ userId, id, patch, query = db.query }) {
  const setParts = [];
  const values = [];

  const hasName = patch && Object.prototype.hasOwnProperty.call(patch, "name");
  const hasSequence = patch && Object.prototype.hasOwnProperty.call(patch, "sequence");
  const hasTickMs = patch && Object.prototype.hasOwnProperty.call(patch, "tickMs");
  const hasSupportedChannelKeys = patch && Object.prototype.hasOwnProperty.call(patch, "supportedChannelKeys");
  const hasPlayPolicy = patch && Object.prototype.hasOwnProperty.call(patch, "playPolicy");
  const hasMinOutputCount = patch && Object.prototype.hasOwnProperty.call(patch, "minOutputCount");
  const hasSequenceVersion = patch && Object.prototype.hasOwnProperty.call(patch, "sequenceVersion");

  if (hasName) {
    setParts.push("`name` = ?");
    values.push(String(patch.name || "").trim());
  }

  if (hasSequence) {
    const payload = buildCustomWaveformPayload({
      sequenceInput: patch.sequence,
      tickMsInput: hasTickMs ? patch.tickMs : undefined,
      supportedChannelKeysInput: hasSupportedChannelKeys ? patch.supportedChannelKeys : undefined,
      playPolicyInput: hasPlayPolicy ? patch.playPolicy : undefined,
      minOutputCountInput: hasMinOutputCount ? patch.minOutputCount : undefined,
      sequenceVersionInput: hasSequenceVersion ? patch.sequenceVersion : undefined
    });
    setParts.push("`sequence` = ?");
    values.push(JSON.stringify(payload.sequenceLegacy));
    setParts.push("`sequenceJson` = ?");
    values.push(JSON.stringify(payload.sequenceV1));
    setParts.push("`tickMs` = ?");
    values.push(payload.tickMs);
    setParts.push("`sequenceVersion` = ?");
    values.push(payload.sequenceVersion);
    setParts.push("`supportedChannelKeys` = ?");
    values.push(JSON.stringify(payload.supportedChannelKeys));
    setParts.push("`playPolicy` = ?");
    values.push(payload.playPolicy);
    setParts.push("`minOutputCount` = ?");
    values.push(payload.minOutputCount);
  } else {
    if (hasTickMs) {
      setParts.push("`tickMs` = ?");
      values.push(normalizeTickMs(patch.tickMs));
    }
    if (hasSequenceVersion) {
      setParts.push("`sequenceVersion` = ?");
      values.push(normalizePositiveInt(patch.sequenceVersion, 1));
    }
    if (hasSupportedChannelKeys) {
      const keys = normalizeSupportedChannelKeys(patch.supportedChannelKeys, ["suction"]) || ["suction"];
      setParts.push("`supportedChannelKeys` = ?");
      values.push(JSON.stringify(keys));
    }
    if (hasPlayPolicy) {
      setParts.push("`playPolicy` = ?");
      values.push(normalizeEnum(patch.playPolicy, ["ACTIVE_ONLY", "BOTH"], "ACTIVE_ONLY"));
    }
    if (hasMinOutputCount) {
      setParts.push("`minOutputCount` = ?");
      values.push(normalizePositiveInt(patch.minOutputCount, 1));
    }
  }

  if (setParts.length === 0) return { notModified: true };

  setParts.push("`updateTime` = NOW()");
  values.push(id, userId);

  const result = await query(`UPDATE waveforms_custom SET ${setParts.join(", ")} WHERE id = ? AND userid = ?`, values);
  const affected = Number(result?.affectedRows || 0);
  if (affected === 0) return { notFound: true };

  const rows = await query("SELECT * FROM waveforms_custom WHERE id = ? AND userid = ? LIMIT 1", [id, userId]);
  const row = rows && rows[0] ? rows[0] : null;
  if (!row) return { notFound: true };
  return { data: normalizeCustomWaveformRow(row) };
}

async function listWaveformsCustom({ userId, limit, offset, query = db.query }) {
  const totalRows = await query("SELECT COUNT(*) AS total FROM waveforms_custom WHERE userid = ?", [userId]);
  const total = Number(totalRows?.[0]?.total || 0);
  const rows = await query("SELECT * FROM waveforms_custom WHERE userid = ? ORDER BY updateTime DESC LIMIT ? OFFSET ?", [
    userId,
    limit,
    offset
  ]);
  const items = (rows || []).map((r) => normalizeCustomWaveformRow(r));
  return { total, items };
}

module.exports = {
  buildCustomWaveformPayload,
  normalizeCustomWaveformRow,
  createWaveformCustom,
  updateWaveformCustom,
  listWaveformsCustom
};

