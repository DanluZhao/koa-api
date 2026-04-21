require("dotenv").config();

const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");

const Koa = require("koa");
const cors = require("@koa/cors");
const { koaBody } = require("koa-body");
const mount = require("koa-mount");
const serve = require("koa-static");

const { errorHandler } = require("./middleware/errorHandler");
const routes = require("./routes");
const { swaggerAssetsMiddleware, swaggerUiMiddleware, swaggerRouter } = require("./routes/swagger");
const db = require("./db");

const app = new Koa();
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "tmp", "uploads");
const mediaRoot = process.env.MEDIA_ROOT || path.join(process.cwd(), "tmp", "media");
const mediaUploadsRoot = path.join(mediaRoot, "uploads");
const mediaImageDir = path.join(mediaUploadsRoot, "images");
const mediaAudioDir = path.join(mediaUploadsRoot, "audio");

app.on("error", (err) => {
  const message = err && typeof err === "object" ? err.stack || err.message : String(err);
  process.stderr.write(`${message}\n`);
});

app.use(errorHandler());

app.use(async (ctx, next) => {
  if (ctx.path === "/favicon.ico" || ctx.path === "/robots.txt") {
    ctx.status = 204;
    return;
  }
  await next();
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
      maxFileSize: Number(process.env.MAX_FILE_SIZE || 50 * 1024 * 1024)
    }
  })
);

app.use(swaggerAssetsMiddleware);
app.use(swaggerRouter.routes());
app.use(swaggerRouter.allowedMethods());
app.use(swaggerUiMiddleware);
app.use(mount("/media", serve(mediaRoot, { index: false })));

app.use(routes.routes());
app.use(routes.allowedMethods());

async function start() {
  await fs.mkdir(uploadDir, { recursive: true });
  fsSync.mkdirSync(mediaImageDir, { recursive: true });
  fsSync.mkdirSync(mediaAudioDir, { recursive: true });

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
