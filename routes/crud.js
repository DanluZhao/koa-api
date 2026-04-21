const Router = require("@koa/router");

const { loadSchemasFromDatabase } = require("../models/schema");
const { createCrudController } = require("../controllers/crudController");
const { authRequired } = require("../middleware/auth");

let cached = null;
let cachedAt = 0;

async function getSchemas() {
  const ttlMs = Number(process.env.SCHEMA_CACHE_TTL_MS || 30_000);

  if (cached && Date.now() - cachedAt < ttlMs) return cached;

  const schemas = await loadSchemasFromDatabase();
  cached = schemas;
  cachedAt = Date.now();
  return schemas;
}

const controller = createCrudController({ getSchemas });

const router = new Router({ prefix: "/api" });

router.use(authRequired({ type: "admin" }));

router.get("/tables", controller.listTables);
router.get("/:table/meta", controller.meta);

router.get("/:table", controller.list);
router.get("/:table/:id", controller.getById);
router.post("/:table", controller.create);
router.put("/:table/:id", controller.updateById);
router.delete("/:table/:id", controller.removeById);

module.exports = {
  router
};
