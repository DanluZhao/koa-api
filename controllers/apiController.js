const { selectOnePlusOne } = require("../models/testDbModel");

async function version(ctx) {
  ctx.body = {
    version: process.env.API_VERSION || "v1"
  };
}

async function testDb(ctx) {
  const result = await selectOnePlusOne();

  ctx.body = {
    ok: true,
    result
  };
}

module.exports = {
  version,
  testDb
};
