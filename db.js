const mysql = require("mysql2/promise");

function parseIntEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "mysql",
  port: parseIntEnv(process.env.DB_PORT, 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "test",
  waitForConnections: true,
  connectionLimit: parseIntEnv(process.env.DB_CONNECTION_LIMIT, 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function initDb({
  retries = parseIntEnv(process.env.DB_INIT_RETRIES, 20),
  baseDelayMs = parseIntEnv(process.env.DB_INIT_DELAY_MS, 500),
  maxDelayMs = parseIntEnv(process.env.DB_INIT_MAX_DELAY_MS, 5000)
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(delayMs);
    }
  }

  const error = new Error("Database initialization failed after retries");
  error.cause = lastError;
  throw error;
}

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = {
  pool,
  initDb,
  query
};
