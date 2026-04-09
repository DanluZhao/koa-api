const Router = require("@koa/router");
const { health } = require("../controllers/healthController");

const router = new Router();

router.get("/health", health);

module.exports = router;
