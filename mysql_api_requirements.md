# App 迁移 MySQL 接口需求文档 (AI 助手提示词)

> **使用说明**：你可以直接全选复制以下**全部内容**发送给其他 AI 助手（或者在当前环境开启新的后端项目对话），让其帮你快速生成对应的数据库表和后端接口代码。

---

你好，我们需要将 App 的后端服务从**腾讯云开发（CloudBase）**迁移到基于 **MySQL** 的自建服务端。为了最大程度减少 App 客户端的修改工作量，我们需要你按照以下提供的接口清单，帮我完善并生成后端接口代码（包含路由、Controller、Service 以及 MySQL 的 DDL 表结构）。

## 核心开发约定（必须严格遵守）

1. **统一的返回格式（最重要）**：
   必须完全兼容原腾讯云开发的返回结构，所有接口返回必须符合以下 JSON 格式：
   ```json
   {
     "success": true, 
     "data": { ... }, // 成功时返回的数据，可以是对象或数组
     "error": {       // 失败时返回的错误信息（当 success 为 false 时存在）
       "code": "ERROR_CODE",
       "message": "详细错误描述"
     }
   }
   ```
2. **认证方式**：
   采用 JWT 鉴权，客户端通过请求头传递：`Authorization: Bearer <token>`。
3. **分页与排序**：
   列表接口统一使用 `limit`、`offset`（或 `skip`）进行分页，`sortBy` 和 `sortOrder` 进行排序。
4. **软删除**：
   针对核心业务数据（如用户、记录、自定义波形等），建议使用 `is_deleted` 或 `deleted_at` 字段进行软删除。

---

## 接口需求清单

### 1. 账号与会话 (Auth / Session)
*对应原 CloudAuthService、JiguangLoginService、WechatAuthService*
- `POST /auth/register`：账号注册（参数：username, password, email, phone, nickname）
- `POST /auth/login`：账号密码登录
- `POST /auth/logout`：退出登录/注销会话
- `POST /auth/token/refresh`：刷新 Token
- `POST /auth/session/restore`：恢复会话，验证本地 token 的有效性
- `GET /auth/me`：获取当前登录用户的基础认证信息
- `POST /auth/login/wechat`：微信授权登录（参数：code, openId, unionId 等）
- `POST /auth/login/jiguang`：极光一键登录（参数：loginToken）

### 2. 用户资料 (User Profile)
*对应原 updateUserInfo / getCloudUserInfo*
- `GET /users/me`：获取当前用户的完整资料（nickname, avatar_url, preferences 等）
- `PATCH /users/me`：更新当前用户资料
- `GET /system/avatars`：获取系统默认头像列表（对应原 sys_profilephoto 集合）

### 3. 文章流 (Articles)
*对应原 ArticleService*
- `GET /articles`：获取已发布文章列表（支持 limit, offset, sortBy: publishDate）
- `GET /articles/:id`：获取文章详情（调用后顺便在后端触发浏览量 viewCount + 1）
- `GET /articles/category/:category`：获取指定分类的文章列表
- `GET /articles/search`：文章搜索（参数：q）

### 4. 弹窗与广告 (Ads)
*对应原 HomeScreen 的 ads_new_products 查询*
- `GET /ads/new-products`：获取首页新产品推送广告（过滤条件：status=pushed, limit=1）

### 5. 商城 (Products)
*对应原 ProductService*
- `GET /products`：获取商品列表（支持 category, searchText, limit, offset, sortBy(价格/销量)）
- `GET /products/:id`：获取商品详情

### 6. 冥想音频 (Meditation)
*对应原 AudioService*
- `GET /meditation/audios`：获取冥想音频列表（过滤条件：published=1，返回需包含 url, duration, coverUrl）

### 7. 凯格尔运动 (Kegels)
*对应原 KegelService*
- `GET /kegels`：获取凯格尔训练内容列表（过滤条件：published=1，按 createdAt 倒序）

### 8. 使用记录 (Usage Records)
*对应原 RecordService，目前 App 端强依赖使用摘要*
- `GET /usage/summary`：获取当前用户的使用摘要（totalDuration 总时长、favoriteMode 最爱模式、lastUsedAt 最后使用时间）
- `GET /usage/records`：获取当前用户的使用记录列表（按 used_at 倒序，支持分页）
- `POST /usage/records`：写入一次新的使用记录（参数：duration, mode, toy_id, used_at）

### 9. 成就系统 (Achievements)
*对应原 AchievementsService*
- `GET /achievements/catalog`：获取所有的成就勋章目录
- `GET /achievements/my-codes`：获取当前用户已解锁的成就 code 数组
- `POST /achievements/award`：给用户发放成就（需做幂等处理，同一 code 重复请求不报错，参数：code）

### 10. 波形库 (Waveforms)
*对应原 WaveformService*
- `GET /waveforms/preset`：获取系统预设波形列表
- `GET /waveforms/custom`：获取当前用户的自定义波形列表
- `POST /waveforms/custom`：创建自定义波形（参数：name, sequence数组）
- `PATCH /waveforms/custom/:id`：更新自定义波形
- `DELETE /waveforms/custom/:id`：删除自定义波形

---

