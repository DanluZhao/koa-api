const db = require("../db");

async function selectOnePlusOne() {
  const rows = await db.query("SELECT 1 + 1 AS result");
  return rows[0]?.result;
}

module.exports = {
  selectOnePlusOne
};
