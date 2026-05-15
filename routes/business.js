const Router = require("@koa/router");
const { authRequired } = require("../middleware/auth");
const business = require("../controllers/businessController");

const legacyRouter = new Router();

legacyRouter.post("/auth/register", business.authRegister);
legacyRouter.post("/auth/login", business.authLogin);
legacyRouter.post("/auth/logout", authRequired(), business.authLogout);
legacyRouter.post("/auth/token/refresh", business.authRefresh);
legacyRouter.post("/auth/session/restore", authRequired(), business.authSessionRestore);
legacyRouter.get("/auth/me", authRequired(), business.authMe);
legacyRouter.post("/auth/login/wechat", business.authLoginWechat);
legacyRouter.post("/auth/login/jiguang", business.authLoginJiguang);

legacyRouter.get("/users/me", authRequired(), business.getUsersMe);
legacyRouter.patch("/users/me", authRequired(), business.patchUsersMe);

legacyRouter.get("/system/avatars", business.getSystemAvatars);

legacyRouter.get("/articles", business.getArticles);
legacyRouter.get("/articles/search", business.searchArticles);
legacyRouter.get("/articles/category/:category", business.getArticlesByCategory);
legacyRouter.get("/articles/:id", business.getArticleById);

legacyRouter.get("/ads/new-products", business.getAdsNewProducts);

legacyRouter.get("/products", business.getProducts);
legacyRouter.get("/products/:id", business.getProductById);

legacyRouter.get("/meditation/audios", business.getMeditationAudios);

legacyRouter.get("/kegels", business.getKegels);

legacyRouter.get("/usage/summary", authRequired(), business.getUsageSummary);
legacyRouter.get("/usage/records", authRequired(), business.getUsageRecords);
legacyRouter.get("/usage/stats", authRequired(), business.getUsageStats);
legacyRouter.post("/usage/records", authRequired(), business.postUsageRecords);

legacyRouter.get("/achievements/catalog", business.getAchievementsCatalog);
legacyRouter.get("/achievements/my-codes", authRequired(), business.getAchievementsMyCodes);
legacyRouter.post("/achievements/award", authRequired(), business.postAchievementsAward);

legacyRouter.get("/waveforms/preset", business.getWaveformsPreset);
legacyRouter.get("/waveforms/custom", authRequired(), business.getWaveformsCustom);
legacyRouter.post("/waveforms/custom", authRequired(), business.postWaveformsCustom);
legacyRouter.patch("/waveforms/custom/:id", authRequired(), business.patchWaveformsCustomById);
legacyRouter.delete("/waveforms/custom/:id", authRequired(), business.deleteWaveformsCustomById);

const adminRouter = new Router({ prefix: "/admin" });
adminRouter.post("/auth/register", business.authRegister);
adminRouter.post("/auth/login", business.authLogin);
adminRouter.use(authRequired({ type: "admin" }));
adminRouter.post("/auth/logout", business.authLogout);
adminRouter.post("/auth/token/refresh", business.authRefresh);
adminRouter.post("/auth/session/restore", business.authSessionRestore);
adminRouter.get("/auth/me", business.authMe);
adminRouter.get("/auth/permissions", business.adminListUserAuth);
adminRouter.get("/auth/permissions/:userid", business.adminGetUserAuth);
adminRouter.post("/auth/permissions", business.adminUpsertUserAuth);
adminRouter.get("/system/nicknames", business.adminListSystemNicknames);
adminRouter.patch("/system/nicknames/:id/enable", business.adminToggleSystemNicknameEnable);
adminRouter.post("/system/nicknames", business.adminCreateSystemNickname);
adminRouter.post("/system/nicknames/import", business.adminImportSystemNicknames);

const appRouter = new Router({ prefix: "/app" });
appRouter.post("/auth/login/wechat", business.authLoginWechat);
appRouter.post("/auth/login/jiguang/verify", business.authLoginJiguangVerify);
appRouter.post("/auth/login/jiguang", business.authLoginJiguang);
appRouter.post("/auth/register/jiguang/complete", business.authRegisterJiguangComplete);
appRouter.get("/system/nicknames", business.appGetSystemNicknames);
appRouter.get("/system/avatars", business.getSystemAvatars);
appRouter.get("/system/liquidsettings/gap", business.getSystemLiquidsettingsGap);
appRouter.get("/system/liquidsettings/total", business.getSystemLiquidsettingsTotal);
appRouter.get("/system/ble-device-profiles/resolve", business.appResolveBleDeviceProfile);
appRouter.use(authRequired({ type: "user" }));

appRouter.get("/users/me", business.getUsersMe);
appRouter.patch("/users/me", business.patchUsersMe);
appRouter.get("/users/me/liquidsetting", business.getUsersMeLiquidsetting);
appRouter.post("/users/me/liquidsetting", business.postUsersMeLiquidsetting);

appRouter.get("/articles", business.getArticles);
appRouter.get("/articles/search", business.searchArticles);
appRouter.get("/articles/category/:category", business.getArticlesByCategory);
appRouter.get("/articles/:id", business.getArticleById);

appRouter.get("/ads/new-products", business.getAdsNewProducts);

appRouter.get("/products", business.getProducts);
appRouter.get("/products/:id", business.getProductById);

appRouter.get("/meditation/audios", business.getMeditationAudios);

appRouter.get("/kegels", business.getKegels);

appRouter.get("/usage/summary", business.getUsageSummary);
appRouter.get("/usage/records", business.getUsageRecords);
appRouter.get("/usage/stats", business.getUsageStats);
appRouter.post("/usage/records", business.postUsageRecords);

appRouter.get("/achievements/catalog", business.getAchievementsCatalog);
appRouter.get("/achievements/my-codes", business.getAchievementsMyCodes);
appRouter.post("/achievements/award", business.postAchievementsAward);
appRouter.post("/achievements/events", business.postAchievementsEvents);

appRouter.get("/waveforms/preset", business.getWaveformsPreset);
appRouter.get("/waveforms/custom", business.getWaveformsCustom);
appRouter.post("/waveforms/custom", business.postWaveformsCustom);
appRouter.patch("/waveforms/custom/:id", business.patchWaveformsCustomById);
appRouter.delete("/waveforms/custom/:id", business.deleteWaveformsCustomById);

appRouter.get("/mode-explore", business.appGetModeExplore);

module.exports = {
  legacyRouter,
  adminRouter,
  appRouter
};
