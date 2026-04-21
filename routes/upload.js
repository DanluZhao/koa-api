const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Router = require("@koa/router");

const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 50 * 1024 * 1024);
const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), "tmp", "media");
const UPLOADS_ROOT = path.join(MEDIA_ROOT, "uploads");
const IMAGE_DIR = path.join(UPLOADS_ROOT, "images");
const AUDIO_DIR = path.join(UPLOADS_ROOT, "audio");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a"]);
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AUDIO_MIMES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a"]);

function apiFail(ctx, code, message, details) {
  ctx.status = 200;
  ctx.body = {
    success: false,
    data: null,
    error: {
      code,
      message,
      details: details !== undefined ? details : undefined
    }
  };
}

function ensureUploadDirs() {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

function getFileFromRequest(ctx) {
  const files = ctx.request.files || {};
  const candidate = files.file || files.upload || files.media;
  if (!candidate) return null;
  return Array.isArray(candidate) ? candidate[0] : candidate;
}

function getFileInfo(file) {
  const originalFilename = file.originalFilename || file.name || "";
  const mimeType = (file.mimetype || file.type || "").toLowerCase();
  const tempPath = file.filepath || file.path;
  const size = Number(file.size || 0);
  const extFromName = path.extname(originalFilename).toLowerCase();
  const extFromTemp = path.extname(tempPath || "").toLowerCase();
  const ext = extFromName || extFromTemp;
  return { originalFilename, mimeType, tempPath, size, ext };
}

function classifyFile(info) {
  const isImage = IMAGE_EXTS.has(info.ext) || IMAGE_MIMES.has(info.mimeType);
  const isAudio = AUDIO_EXTS.has(info.ext) || AUDIO_MIMES.has(info.mimeType);
  if (isImage) return { folder: "images", targetDir: IMAGE_DIR };
  if (isAudio) return { folder: "audio", targetDir: AUDIO_DIR };
  return null;
}

function moveFileSafe(source, target) {
  try {
    fs.renameSync(source, target);
  } catch (err) {
    if (err && err.code === "EXDEV") {
      fs.copyFileSync(source, target);
      fs.unlinkSync(source);
      return;
    }
    throw err;
  }
}

const router = new Router({ prefix: "/api" });

router.post("/upload", async (ctx) => {
  const file = getFileFromRequest(ctx);
  if (!file) {
    apiFail(ctx, "INVALID_PARAM", "Missing upload file field (file/upload/media)");
    return;
  }

  const info = getFileInfo(file);
  if (!info.tempPath) {
    apiFail(ctx, "INVALID_PARAM", "Invalid upload temp file");
    return;
  }

  if (!info.ext) {
    apiFail(ctx, "INVALID_PARAM", "Cannot detect file extension");
    return;
  }

  if (info.size <= 0) {
    apiFail(ctx, "INVALID_PARAM", "Empty file");
    return;
  }

  if (info.size > MAX_FILE_SIZE) {
    apiFail(ctx, "FILE_TOO_LARGE", `File too large. Max size is ${MAX_FILE_SIZE} bytes`);
    return;
  }

  const classification = classifyFile(info);
  if (!classification) {
    apiFail(ctx, "UNSUPPORTED_FILE_TYPE", "Only jpg/png/webp/mp3/wav/m4a are supported", {
      ext: info.ext,
      mimeType: info.mimeType
    });
    return;
  }

  ensureUploadDirs();

  const filename = `${Date.now()}-${crypto.randomUUID()}${info.ext}`;
  const targetPath = path.join(classification.targetDir, filename);

  try {
    moveFileSafe(info.tempPath, targetPath);
  } catch (err) {
    apiFail(ctx, "UPLOAD_WRITE_FAILED", err?.message || "Failed to store uploaded file");
    return;
  }

  const baseUrl = process.env.BASE_URL || process.env.PUBLIC_BASE_URL || `${ctx.protocol}://${ctx.host}`;
  const url = `${baseUrl}/media/uploads/${classification.folder}/${filename}`;

  ctx.status = 200;
  ctx.body = {
    success: true,
    data: {
      url,
      filename
    }
  };
});

module.exports = router;
