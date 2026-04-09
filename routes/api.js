const Router = require("@koa/router");
const { testDb, version } = require("../controllers/apiController");

const router = new Router({ prefix: "/api" });

router.get("/version", version);
router.post("/test-db", testDb);

module.exports = router;
