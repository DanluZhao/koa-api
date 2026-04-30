const db = require("../db");

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (Buffer.isBuffer(value)) {
    try {
      return JSON.parse(value.toString("utf8"));
    } catch {
      return fallback;
    }
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return fallback;
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }
  return value;
}

function toPlayableSequence(row) {
  const tickMsRaw = row?.tickMs ?? row?.tick_ms;
  const tickMs = Number(tickMsRaw) || 80;

  const sequenceJsonValue = row?.sequenceJson ?? row?.sequence_json;
  const legacyValue = row?.sequenceLegacy ?? row?.sequence;

  const seqObj = parseJsonField(sequenceJsonValue, null);
  if (seqObj && typeof seqObj === "object") return seqObj;

  const legacy = parseJsonField(legacyValue, []);
  const values = Array.isArray(legacy) ? legacy : [];
  return { v: 1, tickMs, loop: true, channels: [{ key: "suction", values }] };
}

function normalizeSupportedChannelKeys(row) {
  const raw = row?.supportedChannelKeys ?? row?.supported_channel_keys;
  const parsed = parseJsonField(raw, null);
  if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  return ["suction"];
}

function normalizeWaveform(row) {
  const tickMsRaw = row?.tickMs ?? row?.tick_ms;
  const sequenceVersionRaw = row?.sequenceVersion ?? row?.sequence_version;
  const minOutputCountRaw = row?.minOutputCount ?? row?.min_output_count;

  return {
    ...row,
    id: row?.id ?? row?.waveformId,
    name: row?.name ?? row?.waveformName,
    waveImage: row?.waveImage ?? row?.waveImage,
    isPublished: row?.isPublished ?? row?.waveformPublished,
    tickMs: Number(tickMsRaw) || 80,
    sequenceVersion: Number(sequenceVersionRaw) || 1,
    supportedChannelKeys: normalizeSupportedChannelKeys(row),
    playPolicy: row?.playPolicy ?? row?.play_policy ?? "ACTIVE_ONLY",
    minOutputCount: Number(minOutputCountRaw) || 1,
    sequence: toPlayableSequence(row)
  };
}

async function listPresetWaveforms({ limit, offset, query = db.query }) {
  const totalRows = await query("SELECT COUNT(*) AS total FROM waveforms WHERE isPublished = TRUE", []);
  const total = Number(totalRows?.[0]?.total || 0);

  const rows = await query(
    "SELECT * FROM waveforms WHERE isPublished = TRUE ORDER BY updateTime DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );

  const items = (rows || []).map((r) => ({ ...normalizeWaveform(r), _id: r.id }));
  return { total, items };
}

async function getModeExplore({ includeUnpublished = false, query = db.query }) {
  const where = includeUnpublished ? "" : "WHERE c.isPublished = TRUE AND w.isPublished = TRUE";
  const rows = await query(
    `SELECT
      c.id AS categoryId,
      c.name AS categoryName,
      c.iconUrl AS categoryIconUrl,
      c.sortOrder AS categorySortOrder,
      c.isPublished AS categoryPublished,

      w.id AS waveformId,
      w.name AS waveformName,
      w.waveImage AS waveImage,
      w.isPublished AS waveformPublished,

      w.sequence AS sequenceLegacy,
      w.sequenceJson AS sequenceJson,
      w.tickMs AS tickMs,
      w.sequenceVersion AS sequenceVersion,
      w.supportedChannelKeys AS supportedChannelKeys,
      w.playPolicy AS playPolicy,
      w.minOutputCount AS minOutputCount,

      mcw.sortOrder AS waveformSortOrder
    FROM mode_categories c
    JOIN mode_category_waveforms mcw ON mcw.categoryId = c.id
    JOIN waveforms w ON w.id = mcw.waveformId
    ${where}
    ORDER BY c.sortOrder ASC, c.id ASC, mcw.sortOrder ASC, w.id ASC`,
    []
  );

  const categories = [];
  const byId = new Map();

  for (const r of rows || []) {
    const catId = Number(r.categoryId);
    let cat = byId.get(catId);
    if (!cat) {
      cat = {
        id: catId,
        name: r.categoryName,
        iconUrl: r.categoryIconUrl || null,
        sortOrder: Number(r.categorySortOrder) || 0,
        waveforms: []
      };
      categories.push(cat);
      byId.set(catId, cat);
    }

    const wf = normalizeWaveform({
      id: r.waveformId,
      name: r.waveformName,
      waveImage: r.waveImage,
      isPublished: r.waveformPublished,
      sequenceLegacy: r.sequenceLegacy,
      sequenceJson: r.sequenceJson,
      tickMs: r.tickMs,
      sequenceVersion: r.sequenceVersion,
      supportedChannelKeys: r.supportedChannelKeys,
      playPolicy: r.playPolicy,
      minOutputCount: r.minOutputCount
    });
    cat.waveforms.push(wf);
  }

  return { categories };
}

module.exports = {
  parseJsonField,
  toPlayableSequence,
  normalizeWaveform,
  listPresetWaveforms,
  getModeExplore
};
