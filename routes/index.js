const Router = require("@koa/router");

const healthRouter = require("./health");
const apiRouter = require("./api");
const uploadRouter = require("./upload");
const { router: crudRouter } = require("./crud");
const { authRequired } = require("../middleware/auth");
const { legacyRouter, adminRouter, appRouter } = require("./business");

const router = new Router();

router.use(healthRouter.routes(), healthRouter.allowedMethods());
router.use(apiRouter.routes(), apiRouter.allowedMethods());
router.use(uploadRouter.routes(), uploadRouter.allowedMethods());
router.use(crudRouter.routes(), crudRouter.allowedMethods());

const adminApiRouter = new Router({ prefix: "/admin" });
adminApiRouter.use("/api", authRequired({ type: "admin" }));
adminApiRouter.use(apiRouter.routes(), apiRouter.allowedMethods());
adminApiRouter.use(crudRouter.routes(), crudRouter.allowedMethods());
router.use(adminApiRouter.routes(), adminApiRouter.allowedMethods());

router.use(adminRouter.routes(), adminRouter.allowedMethods());
router.use(appRouter.routes(), appRouter.allowedMethods());
router.use(legacyRouter.routes(), legacyRouter.allowedMethods());

module.exports = router;
