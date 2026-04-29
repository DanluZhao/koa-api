const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../db");
const { resolveBleDeviceProfile } = require("../services/bleDeviceProfileService");
const businessController = require("../controllers/businessController");

function stubDbQueryOnceSequence(sequence) {
  let i = 0;
  return async (sql, params) => {
    const next = sequence[i];
    i += 1;
    if (typeof next === "function") return next(sql, params);
    return next;
  };
}

test("resolveBleDeviceProfile: LY416 hits EXACT", async () => {
  const original = db.query;
  db.query = stubDbQueryOnceSequence([
    [
      {
        id: 123,
        match_type: "BLE_NAME_EXACT",
        match_value: "LY416",
        ui_mode_count: 2,
        default_active_function: "F1",
        features_json: '{"suction":true,"vibration":false,"tapping":true,"heat":false,"spray":false}',
        force_protocol_output_count: null,
        mirror_when_ui_single_protocol_dual: 0,
        swap_outputs: 0,
        cache_ttl_seconds: null,
        updated_at: new Date("2026-04-29T12:00:00Z")
      }
    ],
    [
      { id: 1, position: 1, channel_key: "tapping", label_zh: "拍打", target_function: "F1" },
      { id: 2, position: 2, channel_key: "suction", label_zh: "吮吸", target_function: "F2" }
    ]
  ]);
  try {
    const res = await resolveBleDeviceProfile({ bleName: "LY416" });
    assert.equal(res.ok, true);
    assert.equal(res.data.profileId, 123);
    assert.deepEqual(res.data.match, { type: "BLE_NAME_EXACT", value: "LY416" });
    assert.equal(res.data.bleName, "LY416");
    assert.equal(res.data.ui.uiModeCount, 2);
    assert.equal(res.data.ui.channels.length, 2);
  } finally {
    db.query = original;
  }
});

test("resolveBleDeviceProfile: LY999 hits PREFIX fallback", async () => {
  const original = db.query;
  db.query = stubDbQueryOnceSequence([
    [
      {
        id: 9,
        match_type: "BLE_NAME_PREFIX",
        match_value: "LY",
        ui_mode_count: 1,
        default_active_function: null,
        features_json: null,
        force_protocol_output_count: 2,
        mirror_when_ui_single_protocol_dual: 1,
        swap_outputs: 1,
        cache_ttl_seconds: 3600,
        updated_at: new Date("2026-04-29T12:00:00Z")
      }
    ],
    [{ id: 10, position: 1, channel_key: "suction", label_zh: "吮吸", target_function: "F1" }]
  ]);
  try {
    const res = await resolveBleDeviceProfile({ bleName: "LY999" });
    assert.equal(res.ok, true);
    assert.equal(res.data.match.type, "BLE_NAME_PREFIX");
    assert.equal(res.data.match.value, "LY");
    assert.equal(res.data.ui.channels[0].key, "suction");
  } finally {
    db.query = original;
  }
});

test("appResolveBleDeviceProfile: empty bleName -> BAD_REQUEST", async () => {
  const ctx = { query: { bleName: "   " }, status: 0, body: null };
  await businessController.appResolveBleDeviceProfile(ctx);
  assert.equal(ctx.status, 200);
  assert.equal(ctx.body.success, false);
  assert.equal(ctx.body.error.code, "BAD_REQUEST");
});

