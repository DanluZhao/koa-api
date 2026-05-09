function formatDateTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds()
  )}`;
}

function parseFeatures(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === "object") return value && !Array.isArray(value) ? value : {};
  if (typeof value !== "string") return {};
  const s = value.trim();
  if (!s) return {};
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function toBool01(value) {
  return value === true || value === 1 || value === "1";
}

function buildBleDeviceProfileDto({ bleName, profileRow, channelRows }) {
  const channels = (channelRows || []).map((c) => ({
    position: Number(c.position),
    key: c.channel_key,
    label: c.label_zh,
    targetFunction: c.target_function
  }));

  return {
    profileId: Number(profileRow.id),
    match: { type: profileRow.match_type, value: profileRow.match_value },
    bleName,
    device_name: profileRow.device_name || null,
    device_image: profileRow.device_image || null,
    ui: {
      uiModeCount: Number(profileRow.ui_mode_count),
      defaultActiveFunction: profileRow.default_active_function || null,
      channels
    },
    features: parseFeatures(profileRow.features_json),
    protocol: {
      forceProtocolOutputCount:
        profileRow.force_protocol_output_count === null || profileRow.force_protocol_output_count === undefined
          ? null
          : Number(profileRow.force_protocol_output_count),
      mirrorWhenUiSingleProtocolDual: toBool01(profileRow.mirror_when_ui_single_protocol_dual),
      swapOutputs: toBool01(profileRow.swap_outputs)
    },
    cacheTtlSeconds:
      profileRow.cache_ttl_seconds === null || profileRow.cache_ttl_seconds === undefined ? null : Number(profileRow.cache_ttl_seconds),
    updatedAt: formatDateTime(profileRow.updated_at)
  };
}

module.exports = {
  buildBleDeviceProfileDto
};
