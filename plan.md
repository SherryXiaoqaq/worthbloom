# WorthBloom · CloudBase 接入 + UI 合并 计划

> 更新：2026-08-24
> 说明：队友把后端从 Supabase 换成 CloudBase（腾讯云），代码已推 GitHub `feature-cloudbase` 分支。
> 目标：① 创建 CloudBase 数据库 ② 把我改的纸感 UI 合并进 feature 版（保留 CloudBase 功能）③ push 回 feature-cloudbase 分支。

## 文件夹关系（先搞清，别拿错）

| 文件夹 | 内容 |
|---|---|
| `E:\worthbloom-main\worthbloom-main` | main 分支 + 我改的纸感 UI（导航箭头 / 花朵照片 flower.webp / webp 图标 / 纸感 CSS） |
| `E:\worthbloom-feature-cloudbase\worthbloom-feature-cloudbase` | feature-cloudbase 分支（CloudBase 全套，但 UI 是队友的简洁版） |
| `E:\worthbloom-merged\worthbloom` | **合并工作区**（feature 版副本，UI 合并在这里做，两个原文件夹不动） |

---

## ✅ 已完成

- [x] 搞清楚两个文件夹的区别：feature 版=CloudBase 功能、main 版=我的纸感 UI
- [x] 腾讯云：注册新账号 + 完成实名认证（避免在原账号上付费）
- [x] 创建 CloudBase 环境（免费体验版 / 上海 / **数据库=云数据库**）
  - 第一次在原账号建错了（PostgreSQL），已作废；改用新账号重建，选对了"云数据库"
- [x] 创建合并工作区 `E:\worthbloom-merged\worthbloom`（复制 feature 版，原文件夹未动）

---

## 🔄 进行中（CloudBase 控制台，还剩这些）

- [ ] **身份认证** → 开启「邮箱验证码 + 账号密码登录」
- [ ] **数据库** → 新建 7 个集合（名字一字不差，权限=仅管理员/服务端可读写）
  ```
  purchase_requests
  reviews
  review_invites
  final_decisions
  saving_goals
  assets
  usage_records
  ```
- [ ] **环境设置 → API Key** → 拿 2 把密钥（Publishable Key + 服务端 API Key）
- [ ] 记下**环境 ID**（浏览器地址栏 `envId=worthbloom-xxxx`）

---

## ⏳ 待完成

1. CloudBase 控制台配置收尾（上面"进行中"的 4 项）
2. 填 `.env.local`：
   - `CLOUDBASE_ENV_ID` = 环境 ID
   - `CLOUDBASE_REGION` = `ap-shanghai`
   - `CLOUDBASE_PUBLISHABLE_KEY` = Publishable Key
   - `CLOUDBASE_APIKEY` = 服务端 API Key
3. 本地跑起来测试：`pnpm install` → `pnpm dev` → 看登录页
4. **UI 合并**：把 main 的纸感 CSS + dashboard-client.tsx 缝进合并区，保留 `cloudBaseFetch` / 登录门 / `emptyData`
5. 复制图片资源（`flower.webp` / `leather.png` / `nav-*.webp`）到合并区 `public/`
6. 找队友要 **GitHub 仓库地址 + collaborator 权限**
7. `git clone` → `checkout feature-cloudbase` → 放合并代码 → commit → pull → push
8. （可选）部署到 CloudBase Run

---

## ⚠️ 注意事项

- **服务端 API Key 严禁**提交到 GitHub / 截图发给别人
- 免费版记得**取消自动续费**
- 数据库类型**建后不能改**，必须是「云数据库」；`环境创建后不可切换数据库类型`
- 不填 `.env.local` 时 App 用**演示数据**，可正常开发 UI，不阻塞
- UI 合并时不能直接覆盖 feature 版文件，否则会把 CloudBase 功能抹掉
