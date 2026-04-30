const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../db");
const { createWaveformCustom, listWaveformsCustom } = require("../services/waveformsCustomService");

function stubDbQueryOnceSequence(sequence) {
  let i = 0;
  const calls = [];
  const fn = async (sql, params) => {
    calls.push({ sql, params });
    const next = sequence[i];
    i += 1;
    return typeof next === "function" ? next(sql, params) : next;
  };
  fn.calls = calls;
  return fn;
}

test("createWaveformCustom: legacy array input -> writes sequenceJson v1 and returns playable v1", async () => {
  const original = db.query;
  const stub = stubDbQueryOnceSequence([
    { affectedRows: 1 },
    [
      {
        id: "x",
        name: "A",
        sequence: "[0,10,20]",
        sequenceJson: null,
        tickMs: 80,
        sequenceVersion: 1,
        supportedChannelKeys: null,
        playPolicy: null,
        minOutputCount: null,
        userid: "u1",
        isPublished: 0,
        createTime: "2026-04-01 00:00:00",
        updateTime: "2026-04-01 00:00:00"
      }
    ]
  ]);
  db.query = stub;
  try {
    const created = await createWaveformCustom({ userId: "u1", name: "A", sequence: [0, 10, 20] });
    assert.equal(created.name, "A");
    assert.equal(created.tickMs, 80);
    assert.deepEqual(created.supportedChannelKeys, ["suction"]);
    assert.equal(created.playPolicy, "ACTIVE_ONLY");
    assert.equal(created.minOutputCount, 1);
    assert.equal(created.sequence.v, 1);
    assert.equal(created.sequence.tickMs, 80);
    assert.equal(created.sequence.channels[0].key, "suction");
    assert.deepEqual(created.sequence.channels[0].values, [0, 10, 20]);

    const insertCall = stub.calls.find((c) => String(c.sql).includes("INSERT INTO waveforms_custom"));
    assert.ok(insertCall);
    assert.equal(Array.isArray(insertCall.params), true);
    assert.equal(typeof insertCall.params[2], "string");
    assert.equal(typeof insertCall.params[3], "string");
    assert.ok(insertCall.params[3].includes("\"channels\""));
  } finally {
    db.query = original;
  }
});

test("createWaveformCustom: v1 input + duplicated supportedChannelKeys preserved", async () => {
  const original = db.query;
  const stub = stubDbQueryOnceSequence([
    { affectedRows: 1 },
    [
      {
        id: "x2",
        name: "B",
        sequence: "[1,2]",
        sequenceJson: '{"v":1,"tickMs":80,"loop":true,"channels":[{"key":"tapping","values":[1,2]},{"key":"tapping","values":[3,4]}]}',
        tickMs: 80,
        sequenceVersion: 1,
        supportedChannelKeys: '["tapping","tapping"]',
        playPolicy: "BOTH",
        minOutputCount: 2,
        userid: "u1",
        isPublished: 0,
        createTime: "2026-04-01 00:00:00",
        updateTime: "2026-04-01 00:00:00"
      }
    ]
  ]);
  db.query = stub;
  try {
    const created = await createWaveformCustom({
      userId: "u1",
      name: "B",
      sequence: { v: 1, tickMs: 80, loop: true, channels: [{ key: "tapping", values: [1, 2] }, { key: "tapping", values: [3, 4] }] },
      supportedChannelKeys: ["tapping", "tapping"],
      playPolicy: "BOTH",
      minOutputCount: 2
    });
    assert.deepEqual(created.supportedChannelKeys, ["tapping", "tapping"]);
    assert.equal(created.playPolicy, "BOTH");
    assert.equal(created.minOutputCount, 2);
    assert.equal(created.sequence.channels.length, 2);
    assert.equal(created.sequence.channels[0].key, "tapping");
    assert.equal(created.sequence.channels[1].key, "tapping");
  } finally {
    db.query = original;
  }
});

test("listWaveformsCustom: returns v1 sequence for each row", async () => {
  const original = db.query;
  const stub = stubDbQueryOnceSequence([
    [{ total: 1 }],
    [
      {
        id: "wf1",
        name: "W1",
        sequence: "[0,10]",
        sequenceJson: null,
        tickMs: 70,
        sequenceVersion: 1,
        supportedChannelKeys: null,
        playPolicy: null,
        minOutputCount: null,
        userid: "u1",
        isPublished: 0,
        createTime: "2026-04-01 00:00:00",
        updateTime: "2026-04-01 00:00:00"
      }
    ]
  ]);
  db.query = stub;
  try {
    const res = await listWaveformsCustom({ userId: "u1", limit: 200, offset: 0 });
    assert.equal(res.total, 1);
    assert.equal(res.items[0].id, "wf1");
    assert.equal(res.items[0].sequence.v, 1);
    assert.equal(res.items[0].sequence.tickMs, 70);
  } finally {
    db.query = original;
  }
});

