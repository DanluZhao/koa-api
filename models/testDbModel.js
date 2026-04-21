const db = require("../db");

async function selectOnePlusOne() {
  try {
    const rows = await db.query("SELECT 1 + 1 AS result");
    return { success: true, data: rows[0]?.result };
  } catch (err) {
    return { success: false, error: String(err?.message || err || "Database error"), code: err?.code };
  }
}

module.exports = {
  selectOnePlusOne
};
