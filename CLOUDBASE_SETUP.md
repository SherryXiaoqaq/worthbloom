# WorthBloom 接入 CloudBase

这版使用三项 CloudBase 能力：

- 身份认证：主人邮箱注册、登录；朋友邀请页不登录。
- 文档数据库：心愿、邀请、回信、养愿进度和已有物资。
- 云托管 CloudBase Run：运行 Next.js 网页和 `/api/*` 服务端接口。

未填写 CloudBase 环境变量时，本地仍使用项目自带的演示数据；填写完整后自动切换到 CloudBase。原来的本地/D1 演示数据不会自动复制到新数据库。

## 1. 创建环境

1. 打开 [CloudBase 控制台](https://tcb.cloud.tencent.com/)，新建环境。
2. 中国大陆用户优先选择 `上海`；记下环境 ID，例如 `worthbloom-1gxxxx`。
3. 在“身份认证 → 登录方式”中启用邮箱验证码和账号密码登录。
4. 在“身份认证 → 安全来源/域名”中加入：
   - 本地调试：`http://localhost:3000`
   - 上线后的 CloudBase 默认域名
   - 以后绑定的自定义域名

## 2. 创建文档数据库集合

进入“数据库 → 文档数据库”，逐个创建下面 17 个集合。权限都设为“仅管理员/服务端可读写”，不要设为所有人可读写：

1. `purchase_requests`
2. `reviews`
3. `review_invites`
4. `final_decisions`
5. `saving_goals`
6. `assets`
7. `usage_records`
8. `wish_images`
9. `claim_tokens`
10. `growth_accounts`
11. `growth_ledger`
12. `agent_sessions`
13. `agent_messages`
14. `agent_reports`
15. `user_profiles`
16. `inbox_states`
17. `shopping_profiles`

至少创建以下索引：

- `review_invites.token`：唯一索引。
- `claim_tokens.token_digest`：唯一索引；不要给原始 claim token 建字段或索引。
- `growth_ledger.idempotency_key`：唯一索引。
- `agent_sessions`：`owner_id + request_id + request_revision + status` 复合索引。
- `agent_messages`：`owner_id + session_id` 复合索引。
- `agent_reports`：`owner_id + session_id` 复合唯一索引。
- `wish_images`：`owner_id + request_id` 复合唯一索引。
- `user_profiles`：`owner_id` 唯一索引。
- `inbox_states`：`owner_id` 唯一索引。
- `shopping_profiles`：`owner_id` 唯一索引。

### 本轮新增字段

- `user_profiles.device_focus_request_id`：当前电子花关注的心愿 ID。切换电子花时由服务端写入，设备读取状态时使用；允许为空。
- `shopping_profiles`：保存用户主动同意后提取出的购物画像结构化结果（商品名、类型、价格、置信度、分类计数），不保存购物截图原图。
- 其余主人数据集合：给 `owner_id` 建普通索引；`growth_ledger` 另给 `user_id` 建普通索引。

当前代码会在主人查询后于服务端排序，因此暂不要求创建排序复合索引。

集合可以是空的，不需要手工添加字段。第一次在网页创建心愿/物资时会写入完整文档。

## 3. 创建两把密钥

进入“环境设置 → API Key”：

1. 创建 **Publishable Key**，填写到 `CLOUDBASE_PUBLISHABLE_KEY`。它会随网页发送到浏览器，属于可公开客户端凭据。
2. 创建服务端 **API Key**，填写到 `CLOUDBASE_APIKEY`。它有管理权限，只能放在 CloudBase Run 环境变量里，不能写进代码、截图、GitHub 或任何 `NEXT_PUBLIC_*` 变量。

本地调试时，在项目根目录复制 `.env.example` 为 `.env.local`，替换为自己的值：

```powershell
Copy-Item .env.example .env.local
notepad .env.local
pnpm.cmd install
pnpm.cmd dev
```

打开 `http://localhost:3000`。看到登录页即说明 CloudBase 配置被识别；注册时会先收到邮箱验证码。

## 4. 部署到 CloudBase Run

这不是纯静态网页，因为朋友提交回信、保存进度和身份校验都需要 `/api`，所以应选“云托管/CloudBase Run”，不要只上传到静态网站托管。

1. 先把当前代码推到 GitHub。（已经推送）
2. CloudBase 控制台进入“云托管”，创建服务，例如 `worthbloom-web`。
3. 选择“代码仓库/GitHub 构建”，仓库选 `worthbloom`，分支选 `main`。
4. 构建方式选 `Dockerfile`；容器端口填 `3000`。
5. 添加运行环境变量：

   ```text
   CLOUDBASE_ENV_ID=你的环境ID
   CLOUDBASE_REGION=ap-shanghai
   CLOUDBASE_PUBLISHABLE_KEY=你的Publishable Key
   CLOUDBASE_APIKEY=你的服务端API Key
   SITE_URL=部署成功后的完整https网址
   DEVICE_ID=flower_01
   DEVICE_OWNER_ID=身份认证中主人账号的用户ID
   DEVICE_SHARED_SECRET=至少32位的随机字符串
   ```

6. 最小实例数测试期可设 `0` 省钱；如果第一次打开明显有冷启动，正式发布后改成 `1`。
7. 部署完成后，把系统给出的域名加入“身份认证 → 安全来源/域名”，并把相同域名填回 `SITE_URL` 后重新部署。
8. 测试完整流程：注册/登录 → 建心愿 → 复制一张邀请卡 → 无痕窗口打开 → 朋友提交 → 主人刷新看到回信 → 决定存钱/购买。

## 5. 数据与权限说明

- 主人每次调用 `/api/data` 都携带 CloudBase access token；服务端通过 `/auth/v1/user/me` 校验后才接受操作。
- 每一条业务文档都有 `owner_id`，查询和修改都会校验它，用户之间不会混用数据。
- `/api/review` 是公开接口，但只接受随机邀请 token；返回内容仅限当前心愿的必要字段。
- 每张邀请卡使用后写入 `used_at` 并失效；同一个心愿可继续生成多张独立邀请卡。
- 真实服务端 API Key 若曾被提交到 GitHub，应立即在 CloudBase 控制台轮换，而不是只删除 Git 历史里的文件。

## 6. 常见问题

- 页面仍是本地演示数据：四个 `CLOUDBASE_*` 环境变量没有全部填写，或修改后没有重启 `pnpm.cmd dev`。
- 登录报“非法来源”：把当前协议+域名（本地是 `http://localhost:3000`）加入安全来源。
- 数据库提示集合不存在：检查 17 个集合名，必须与上面完全一致；尤其不要漏掉 Agent、claim、成长值、个人资料、购物画像、回信状态和心愿图片相关集合。
- 登录正常但 API 返回 401：确认浏览器和服务端使用的是同一个环境 ID，并检查系统时间。
- 国内首次访问慢：CloudBase Run 最小实例数设为 1，并选择离主要用户近的上海地域。
- 自定义大陆域名无法上线：需要先完成 ICP 备案；测试阶段可以先用 CloudBase 提供的默认域名。

## 7. 桌面花设备

桌面花不使用主人的登录密码，而是通过独立的 `DEVICE_SHARED_SECRET` 调用 `/api/device/state` 和 `/api/device/action`。`DEVICE_OWNER_ID` 在“身份认证 → 用户列表”中复制，表示这盆花应读取哪位主人的数据。设备密钥不要写进网页前端，也不要提交到 GitHub。

固件、采购、接线和烧录的逐步说明见 `hardware/README.md`。CloudBase Run 修改环境变量后需要重新部署服务，硬件才能读到新配置。
