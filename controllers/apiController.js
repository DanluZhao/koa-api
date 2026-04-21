const { selectOnePlusOne } = require("../models/testDbModel");

async function version(ctx) {
  ctx.status = 200;
  ctx.body = {
    success: true,
    data: {
      version: process.env.API_VERSION || "v1"
    }
  };
}

async function testDb(ctx) {
  const dbRes = await selectOnePlusOne();
  ctx.status = 200;

  if (!dbRes.success) {
    ctx.body = {
      success: false,
      data: null,
      error: {
        code: "DB_ERROR",
        message: dbRes.error,
        details: dbRes.code ? { code: dbRes.code } : undefined
      }
    };
    return;
  }

  ctx.body = {
    success: true,
    data: {
      ok: true,
      result: dbRes.data
    }
  };
}

module.exports = {
  version,
  testDb
};
