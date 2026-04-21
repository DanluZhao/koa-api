const db = require("../db");

function buildTableSchema(table, columns) {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const primary = columns.find((c) => c.isPrimaryKey) || byName.get("id") || columns[0];
  const primaryKey = primary?.name || "id";
  const primaryType = (byName.get(primaryKey)?.type || "").toLowerCase();

  const insertableColumns = columns
    .filter((c) => !c.isAutoIncrement)
    .map((c) => c.name);

  const updatableColumns = columns
    .filter((c) => c.name !== primaryKey && !c.isAutoIncrement)
    .map((c) => c.name);

  const shouldGenerateId =
    primaryKey === "id" &&
    !byName.get("id")?.isAutoIncrement &&
    (primaryType.startsWith("varchar") || primaryType.startsWith("char"));

  return {
    table,
    primaryKey,
    columns: columns.map((c) => c.name),
    insertableColumns,
    updatableColumns,
    shouldGenerateId
  };
}

async function loadSchemasFromDatabase({ database } = {}) {
  const dbName = database || process.env.DB_NAME;
  if (!dbName) {
    const err = new Error("DB_NAME is required to introspect schema");
    err.status = 500;
    throw err;
  }

  const tables = await db.query(
    "SELECT TABLE_NAME AS tableName FROM information_schema.tables WHERE table_schema = ? AND TABLE_TYPE = 'BASE TABLE'",
    [dbName]
  );

  const schemas = {};
  for (const row of tables) {
    const table = row.tableName;
    const columns = await db.query(
      "SELECT COLUMN_NAME AS name, COLUMN_KEY AS columnKey, EXTRA AS extra, DATA_TYPE AS dataType, COLUMN_TYPE AS columnType FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ORDINAL_POSITION",
      [dbName, table]
    );

    const mapped = columns.map((c) => ({
      name: c.name,
      type: c.columnType || c.dataType || "",
      isPrimaryKey: c.columnKey === "PRI",
      isAutoIncrement: typeof c.extra === "string" && c.extra.toLowerCase().includes("auto_increment")
    }));

    if (mapped.length === 0) continue;
    schemas[table] = buildTableSchema(table, mapped);
  }

  return schemas;
}

module.exports = {
  loadSchemasFromDatabase
};
