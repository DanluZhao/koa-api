const db = require("../db");

function pickAllowed(input, allowedColumns) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const key of Object.keys(input)) {
    if (allowedColumns.includes(key) && input[key] !== undefined) {
      out[key] = input[key];
    }
  }
  return out;
}

function ok(data) {
  return { success: true, data };
}

function fail(error, code) {
  return { success: false, error: String(error || "Database error"), code };
}

function buildOrderBy({ schema, orderBy, order }) {
  const column = schema.columns.includes(orderBy) ? orderBy : schema.primaryKey;
  const direction = String(order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  return `\`${column}\` ${direction}`;
}

async function listRows({ schema, limit, offset, orderBy, order }) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);

  try {
    const countRows = await db.query(`SELECT COUNT(*) AS total FROM \`${schema.table}\``);
    const total = Number(countRows?.[0]?.total || 0);
    const rows = await db.query(
      `SELECT * FROM \`${schema.table}\` ORDER BY ${buildOrderBy({ schema, orderBy, order })} LIMIT ? OFFSET ?`,
      [safeLimit, safeOffset]
    );

    return ok({
      items: rows,
      total,
      limit: safeLimit,
      offset: safeOffset
    });
  } catch (err) {
    return fail(err?.message || err, err?.code);
  }
}

async function getRowById({ schema, id }) {
  try {
    const rows = await db.query(
      `SELECT * FROM \`${schema.table}\` WHERE \`${schema.primaryKey}\` = ? LIMIT 1`,
      [id]
    );
    const row = rows[0];
    if (!row) return fail("Document not found", "NOT_FOUND");
    return ok(row);
  } catch (err) {
    return fail(err?.message || err, err?.code);
  }
}

async function createRow({ schema, payload }) {
  const data = pickAllowed(payload, schema.insertableColumns);
  const columns = Object.keys(data);

  if (columns.length === 0) {
    return fail("Invalid param", "INVALID_PARAM");
  }

  const placeholders = columns.map(() => "?").join(", ");
  const colSql = columns.map((c) => `\`${c}\``).join(", ");
  const values = columns.map((c) => data[c]);

  try {
    const result = await db.query(
      `INSERT INTO \`${schema.table}\` (${colSql}) VALUES (${placeholders})`,
      values
    );

    const id = schema.primaryKey === "id" && payload?.id ? payload.id : result?.insertId;
    if (id === undefined || id === null || id === "") return ok(String(result?.insertId || ""));
    return ok(String(id));
  } catch (err) {
    return fail(err?.message || err, err?.code);
  }
}

async function updateRowById({ schema, id, payload }) {
  const data = pickAllowed(payload, schema.updatableColumns);
  const columns = Object.keys(data);

  if (columns.length === 0) {
    return fail("Invalid param", "INVALID_PARAM");
  }

  const setSql = columns.map((c) => `\`${c}\` = ?`).join(", ");
  const values = columns.map((c) => data[c]);
  values.push(id);

  try {
    const result = await db.query(
      `UPDATE \`${schema.table}\` SET ${setSql} WHERE \`${schema.primaryKey}\` = ?`,
      values
    );

    const affectedRows = Number(result?.affectedRows || 0);
    if (affectedRows === 0) return fail("Document not found", "NOT_FOUND");
    return ok(affectedRows);
  } catch (err) {
    return fail(err?.message || err, err?.code);
  }
}

async function deleteRowById({ schema, id }) {
  try {
    const result = await db.query(
      `DELETE FROM \`${schema.table}\` WHERE \`${schema.primaryKey}\` = ?`,
      [id]
    );
    const affectedRows = Number(result?.affectedRows || 0);
    if (affectedRows === 0) return fail("Document not found", "NOT_FOUND");
    return ok(affectedRows);
  } catch (err) {
    return fail(err?.message || err, err?.code);
  }
}

module.exports = {
  listRows,
  getRowById,
  createRow,
  updateRowById,
  deleteRowById
};
