const Router = require("@koa/router");

const healthRouter = require("./health");
const apiRouter = require("./api");

const router = new Router();

router.use(healthRouter.routes(), healthRouter.allowedMethods());
router.use(apiRouter.routes(), apiRouter.allowedMethods());

module.exports = router;
