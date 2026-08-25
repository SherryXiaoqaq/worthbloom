# WorthBloom · CloudBase 接入 + UI 合并 计划

> 更新：2026-08-24（合并队友 main 完成，分支已推 GitHub）
> 说明：队友把后端换成 CloudBase（腾讯云）。全部工作已在合并工作区 `E:\worthbloom-merged\worthbloom` 完成：纸感 UI + CloudBase 后端 + 队友的硬件/设备功能合并到一个版本。

## 当前状态（一句话）

**本地已合并完成、编译通过、可正常使用；合并结果已推 GitHub 分支 `scarlett-paper-ui`，等队友 review 后合并进 main。**

---

## ✅ 已完成

### CloudBase 后端
- [x] 腾讯云：注册新账号 + 实名认证（避免在原账号上付费）
- [x] 创建 CloudBase 环境（免费体验版 / 上海 / **数据库=云数据库**）
  - 第一次在原账号建错了（PostgreSQL），已作废；改用新账号重建，选对了"云数据库"
- [x] 身份认证：开启「邮箱验证码 + 账号密码登录」
- [x] 数据库：新建 7 个集合（名字一字不差，权限=仅管理员/服务端可读写）
  ```
  purchase_requests / reviews / review_invites / final_decisions
  saving_goals / assets / usage_records
  ```
- [x] 拿到 2 把密钥 + 环境 ID，填入 `.env.local`（Publishable Key + 服务端 API Key）
- [x] 本地邮箱验证码登录/注册跑通

### 纸感 UI（我这边改的）
- [x] 登录/注册页加**昵称**字段；首页问候显示昵称（按当前时间：早上好/中午好/下午好/晚上好 + 昵称），昵称存 CloudBase 资料 + localStorage
- [x] 纸感 UI 整体合并：`globals.css`（337 行纸感 CSS + 登录门样式）、`dashboard-client.tsx`（纸感导航箭头/花朵照片/webp 底部图标）、登录页纸感化
- [x] 物资卡底色改 **warm cream `#E4E2DA`** + 用 `black-linen-soft.png` 纹理（修掉被 black-linen 压灰的问题）
- [x] 物资卡"物"字圆圈 → **玫瑰徽标**（`rose-badge.png`，从 rose.png 裁剪），所有物资统一
- [x] 移除首页"小好 · 健康"文字 + 红点

### Git / 合并（本次）
- [x] 初始化 git，排除 `.env.local` 等敏感文件
- [x] **合并队友 main**：以 `origin/main` 最新版（0ef344a）为基底，叠回全部纸感 UI 文件 + public 图片
- [x] **补回"决定理由"（decision_note）功能**——队友新版后端把它删了，但 UI 还在用；已在 `types.ts` / `cloudbase-store.ts` / `local-store.ts` / `data/route.ts` 按原逻辑补回
- [x] 采用队友新增的 backend/hardware/device：`hardware/`、`app/api/device/*`、`lib/asset-rules.ts`、`lib/server/device-{auth,state}.ts`、`lib/server/network.ts`、`next.config.ts`、`dev:lan` 脚本
- [x] 编译验证：首页 HTTP 200、纸感 CSS 正常提供、所有后端路由（含 device 系列）编译零错误
- [x] 推分支 `scarlett-paper-ui` 到 GitHub（提交署名 = Scarlett-yzy），删除旧的 `feature-cloudbase`

---

## 🔄 待办

1. **[等队友]** 在 GitHub 上 review 并合并 PR：
   - 链接：`https://github.com/SherryXiaoqaq/worthbloom/pull/new/scarlett-paper-ui`
   - 已确认：基于她 main 最新版，模拟合并零冲突，不会动她的其他分支
2. **浏览器功能回归**（还没在浏览器完整过一遍）：
   登录 → 建心愿 → 生成邀请 → 朋友回信 → 决定（存钱/购买/搁置）→ 养愿卡存钱 → 购买生成物资 → 物资使用/打卡
3. 队友合并后：本地 `git pull origin main` 同步最新
4. （可选）部署到 CloudBase Run

---

## ⚠️ 注意事项

- **服务端 API Key 严禁**提交到 GitHub / 截图发给别人；`.env.local` 带真实密钥，永不 commit
- 免费版记得**取消自动续费**
- 数据库类型**建后不能改**，必须是「云数据库」
- 不填 `.env.local` 时 App 用**演示数据**，可正常开发 UI
- 队友仓库里有 `feature/cloudbase`（斜杠）分支——那是她/旧的，别和我们推的 `scarlett-paper-ui` 搞混
- 本机 Turbopack 文件监听不可靠：改 CSS/TSX 后需要 kill 3000 端口 → `rm -rf .next` → 重启 `pnpm dev` 才生效
