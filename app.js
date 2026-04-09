require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");

const Koa = require("koa");
const cors = require("@koa/cors");
const { koaBody } = require("koa-body");

const { errorHandler } = require("./middleware/errorHandler");
const routes = require("./routes");
const db = require("./db");

const app = new Koa();
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "tmp", "uploads");

app.on("error", (err) => {
  const message = err && typeof err === "object" ? err.stack || err.message : String(err);
  process.stderr.write(`${message}\n`);
});

app.use(errorHandler());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposeHeaders: ["X-Request-Id"],
    credentials: false
  })
);

app.use(
  koaBody({
    multipart: true,
    urlencoded: true,
    json: true,
    formidable: {
      uploadDir,
      keepExtensions: true,
      maxFileSize: Number(process.env.MAX_FILE_SIZE || 10 * 1024 * 1024)
    }
  })
);

app.use(routes.routes());
app.use(routes.allowedMethods());

async function start() {
  await fs.mkdir(uploadDir, { recursive: true });

  if (process.env.DB_ENABLED !== "false") {
    await db.initDb();
  }

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";

  app.listen(port, host);
  process.stdout.write(`API listening on http://${host}:${port}\n`);
}

if (require.main === module) {
  start().catch((err) => {
    process.stderr.write(`${err?.stack || err}\n`);
    process.exit(1);
  });
}

module.exports = {
  app,
  start
};
