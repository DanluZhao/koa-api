const db = require("../db");
const { buildBleDeviceProfileDto } = require("../dtos/bleDeviceProfileDto");

async function queryOne(query, sql, params) {
  const rows = await query(sql, params);
  return rows && rows[0] ? rows[0] : null;
}

async function queryAll(query, sql, params) {
  const rows = await query(sql, params);
  return Array.isArray(rows) ? rows : [];
}

async function resolveBleDeviceProfile({ bleName, query = db.query }) {
  const profile = await queryOne(
    query,
    `SELECT 
      id,
      device_name,
      device_image,
      match_type,
      match_value,
      ui_mode_count,
      default_active_function,
      features_json,
      force_protocol_output_count,
      mirror_when_ui_single_protocol_dual,
      swap_outputs,
      cache_ttl_seconds,
      updated_at
    FROM sys_ble_device_profile
    WHERE is_deleted = 0 AND is_enable = 1 AND (
      (match_type = 'BLE_NAME_EXACT' AND match_value = ?)
      OR (match_type = 'BLE_NAME_PREFIX' AND ? LIKE CONCAT(match_value, '%'))
      OR (match_type = 'BLE_NAME_REGEX' AND ? REGEXP match_value)
    )
    ORDER BY 
      priority DESC,
      CASE match_type
        WHEN 'BLE_NAME_EXACT' THEN 3
        WHEN 'BLE_NAME_PREFIX' THEN 2
        WHEN 'BLE_NAME_REGEX' THEN 1
        ELSE 0
      END DESC,
      id DESC
    LIMIT 1`,
    [bleName, bleName, bleName]
  );

  if (!profile) {
    return { ok: false, code: "NOT_FOUND", message: "No matching device profile" };
  }

  const channels = await queryAll(
    query,
    `SELECT 
      position,
      channel_key,
      label_zh,
      target_function,
      id
    FROM sys_ble_device_profile_channel
    WHERE profile_id = ?
    ORDER BY position ASC, id ASC`,
    [profile.id]
  );

  const dto = buildBleDeviceProfileDto({ bleName, profileRow: profile, channelRows: channels });
  return { ok: true, data: dto };
}

module.exports = {
  resolveBleDeviceProfile
};
