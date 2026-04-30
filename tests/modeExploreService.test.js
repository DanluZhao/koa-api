const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../db");
const { toPlayableSequence, parseJsonField, listPresetWaveforms, getModeExplore } = require("../services/modeExploreService");

function stubDbQueryOnceSequence(sequence) {
  let i = 0;
  return async () => {
    const next = sequence[i];
    i += 1;
    return typeof next === "function" ? next() : next;
  };
}

test("parseJsonField handles string/object/null", () => {
  assert.deepEqual(parseJsonField('["a"]', []), ["a"]);
  assert.deepEqual(parseJsonField(["b"], []), ["b"]);
  assert.deepEqual(parseJsonField(null, ["x"]), ["x"]);
});

test("toPlayableSequence uses sequenceJson when present", () => {
  const seq = { v: 2, tickMs: 80, loop: true, channels: [{ key: "suction", values: [0, 1] }] };
  assert.deepEqual(toPlayableSequence({ sequenceJson: seq, tickMs: 90 }), seq);
});

test("toPlayableSequence wraps legacy sequence when sequenceJson missing", () => {
  const out = toPlayableSequence({ sequence: [0, 10], tickMs: 70 });
  assert.equal(out.v, 1);
  assert.equal(out.tickMs, 70);
  assert.equal(out.loop, true);
  assert.equal(out.channels[0].key, "suction");
  assert.deepEqual(out.channels[0].values, [0, 10]);
});

test("listPresetWaveforms returns playable waveforms with defaults", async () => {
  const original = db.query;
  db.query = stubDbQueryOnceSequence([
    [{ total: 1 }],
    [
      {
        id: "wf1",
        name: "W1",
        sequence: "[0,10]",
        sequenceJson: null,
        tickMs: null,
        sequenceVersion: null,
        supportedChannelKeys: null,
        playPolicy: null,
        minOutputCount: null,
        waveImage: null,
        isPublished: 1,
        createTime: "2026-04-01 00:00:00",
        updateTime: "2026-04-02 00:00:00"
      }
    ]
  ]);
  try {
    const res = await listPresetWaveforms({ limit: 200, offset: 0 });
    assert.equal(res.total, 1);
    assert.equal(res.items[0].id, "wf1");
    assert.equal(res.items[0].tickMs, 80);
    assert.equal(res.items[0].sequenceVersion, 1);
    assert.deepEqual(res.items[0].supportedChannelKeys, ["suction"]);
    assert.equal(res.items[0].playPolicy, "ACTIVE_ONLY");
    assert.equal(res.items[0].minOutputCount, 1);
    assert.equal(res.items[0].sequence.v, 1);
  } finally {
    db.query = original;
  }
});

test("getModeExplore aggregates categories in order", async () => {
  const original = db.query;
  db.query = stubDbQueryOnceSequence([
    [
      {
        categoryId: 1,
        categoryName: "放松",
        categoryIconUrl: "https://x/icon.png",
        categorySortOrder: 10,
        categoryPublished: 1,
        waveformId: "wf_relax_001",
        waveformName: "轻柔呼吸",
        waveImage: "https://x/bg.png",
        waveformPublished: 1,
        sequenceLegacy: "[0,10]",
        sequenceJson: null,
        tickMs: 80,
        sequenceVersion: 1,
        supportedChannelKeys: '["suction"]',
        playPolicy: "ACTIVE_ONLY",
        minOutputCount: 1,
        waveformSortOrder: 1
      }
    ]
  ]);
  try {
    const res = await getModeExplore({ includeUnpublished: false });
    assert.equal(res.categories.length, 1);
    assert.equal(res.categories[0].id, 1);
    assert.equal(res.categories[0].waveforms.length, 1);
    assert.equal(res.categories[0].waveforms[0].id, "wf_relax_001");
  } finally {
    db.query = original;
  }
});

