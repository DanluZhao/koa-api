const Router = require("@koa/router");
const { testDb, version } = require("../controllers/apiController");
const { authRequired } = require("../middleware/auth");

const router = new Router({ prefix: "/api" });

router.get("/version", version);
router.post("/test-db", authRequired({ type: "admin" }), testDb);

module.exports = router;
