# WorthBloom · 好好花

一个面向移动网页的消费决策与物资陪伴产品：把“想买”变成可讨论、可储蓄、可追踪的长期过程。

> 项目阶段：P1 可运行原型（更新于 2026-08-25）  
> 技术栈：Next.js 16、React 19、TypeScript、CloudBase、智谱 GLM、ESP32-S3

## 项目现在能做什么

| 模块 | 当前能力 | 状态 |
| --- | --- | --- |
| 心愿 | 创建心愿，记录价格、理由、类别、次数和有效期 | 可测试 |
| AI 信息提取 | 上传商品截图或粘贴链接，自动填写名称、价格、类别等字段 | 可测试 |
| 朋友建议 | 每位朋友一条随机邀请链接；朋友无需登录，只填写昵称、选择和原因 | 可测试 |
| AI 决策建议 | 可以在没有朋友评价时独立分析；有回信时综合本人理由、购买习惯和朋友意见 | 可测试 |
| 最终决定 | 用户亲自选择现在购买、存钱购买或这次不买，AI 不会代替决定 | 可测试 |
| 养愿 | 从 0 开始存钱，自定义存入金额；达到 100% 后进入已有物资 | 可测试 |
| 物资 | 添加已有物资；按课程、会员、储值、实物分别记录使用；可停止追踪 | 可测试 |
| CloudBase | 邮箱登录、文档数据库、服务端数据隔离 | 已接入，需个人环境配置 |
| 桌面花 | ESP32-S3 圆屏固件、设备状态接口，预留灯光、震动和舵机 | 原型阶段 |

AI 当前使用智谱免费 Flash 模型。免费通道繁忙时，服务端会自动切换到备用免费模型。

## 第一次拉取并运行

### 1. 准备环境

- Git
- Node.js `>= 22.13.0`
- pnpm

Windows PowerShell 如果还没有 pnpm：

```powershell
npm.cmd install -g pnpm
```

使用 `.cmd` 可以避开部分 Windows PowerShell 脚本执行策略问题。

### 2. 下载项目

```powershell
git clone https://github.com/SherryXiaoqaq/worthbloom.git
cd worthbloom
pnpm.cmd install
```

### 3. 直接启动本地演示

首次了解界面时不需要 CloudBase，也不需要创建 `.env.local`：

```powershell
pnpm.cmd dev
```

浏览器打开：

```text
http://localhost:3000
```

此模式使用内存中的演示数据，适合开发 UI 和熟悉流程。服务重启后，本次新增的数据会重置。

### 4. 用手机测试

电脑和手机连接同一个 Wi-Fi，然后运行：

```powershell
pnpm.cmd dev:lan
```

手机打开终端 `Network` 后显示的地址，例如：

```text
http://192.168.1.23:3000
```

若手机打不开，检查 Windows 防火墙是否允许 Node.js 使用“专用网络”。

## 启用 AI

没有 AI Key 时，除 AI 按钮外的本地流程仍可测试。

1. 在[智谱开放平台](https://open.bigmodel.cn/)创建自己的 API Key。
2. 在项目根目录创建 `.env.local`：

```powershell
notepad .env.local
```

3. 只写入以下内容，不要复制 CloudBase 的占位符：

```env
ZHIPU_API_KEY=替换为自己的真实密钥
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_VISION_MODEL=glm-4.6v-flash
ZHIPU_TEXT_MODEL=glm-4.7-flash
ZHIPU_VISION_FALLBACK_MODEL=glm-4v-flash
ZHIPU_TEXT_FALLBACK_MODEL=glm-4-flash-250414
```

保存后必须重启开发服务器。详细说明见 [`docs/ai-setup.md`](docs/ai-setup.md)。

严禁把 API Key 写进代码、截图发群或提交到 GitHub。`.env.local` 已被 `.gitignore` 排除，但提交前仍应检查 `git status`。

## 连接 CloudBase

完整云端模式支持多人分别注册、持久化自己的心愿和物资。需要配置：

- CloudBase 环境 ID 与地域
- Publishable Key
- 服务端 API Key
- 7 个文档数据库集合
- 邮箱登录与安全来源

完整步骤见 [`CLOUDBASE_SETUP.md`](CLOUDBASE_SETUP.md)。

重要：如果复制 `.env.example`，必须把所有 `your-...` 和中文提示值替换成真实配置；不能让占位符留在 `.env.local`，否则程序会误以为 CloudBase 已配置并尝试连接错误环境。

## 队友测试清单

建议每次准备 PR 前至少完成下面流程：

1. 打开首页，切换花园、心愿、养愿和物资四个底部页面。
2. 创建一个心愿，检查手动填写字段。
3. 配置 AI 后，用商品截图或链接识别字段，并人工核对价格和有效期。
4. 创建一个没有朋友回信的心愿，确认 AI 仍能独立给出建议。
5. 复制一张朋友邀请链接，用无痕窗口打开。
6. 朋友填写昵称、购买/存钱/不买、留言，确认无需登录且只能提交一次。
7. 主人刷新心愿，确认可以看到回信并重新请求 AI 综合建议。
8. 选择“存钱购买”，确认从 ¥0 进入养愿；存到 100% 后确认进入物资。
9. 选择“现在购买”，确认心愿结束并进入物资。
10. 分别测试课程、会员、储值和实物的使用记录与停止追踪。

代码检查：

```powershell
pnpm.cmd lint
pnpm.cmd build
```

`lint` 当前可能显示 Next.js 对普通 `<img>` 的性能警告；只要结果是 `0 errors`，不会阻止构建。

## 日常同步和分支协作

不要多人直接在 `main` 或同一个功能分支上写代码。

开始新任务前：

```powershell
git switch main
git pull origin main
git switch -c feature/名字-功能
```

例如：

```powershell
git switch -c feature/scarlett-login
```

完成修改后：

```powershell
git status
git add -A
git commit -m "feat: describe the change"
git push -u origin feature/名字-功能
```

然后在 GitHub 创建 Pull Request，设置：

- base：`main`
- compare：自己的功能分支

准备合并前先同步队友的最新代码：

```powershell
git fetch origin
git merge origin/main
pnpm.cmd install
pnpm.cmd lint
pnpm.cmd build
git push
```

如果 Git 显示冲突，不要直接删除文件或强制 push。先运行 `git status`，把冲突截图和文件名发给团队一起处理。

## 目录结构

```text
app/
  dashboard-client.tsx    手机端主要业务界面
  api/                    数据、AI、朋友回信和硬件接口
  review/                 朋友无需登录的邀请页面
lib/
  server/                 本地、CloudBase、AI 和设备服务端逻辑
  asset-rules.ts          不同物资类别的使用规则
docs/
  ai-setup.md             智谱 AI 配置
hardware/
  README.md               硬件采购、接线和烧录指南
  firmware/               ESP32-S3 PlatformIO 固件
CLOUDBASE_SETUP.md         CloudBase 从零配置与部署
.env.example              环境变量名称模板，不含真实密钥
plan.md                   上一次 CloudBase/UI 合并的历史记录，以本 README 为当前入口
```

## 数据与权限原则

- 主人使用 CloudBase 邮箱账号登录。
- 朋友不登录，只能通过随机邀请 token 查看对应心愿的必要信息。
- 一张邀请链接只能提交一次，不会看到其他朋友留言或主人花园。
- 真实业务文档带 `owner_id`，服务端按主人隔离。
- 智谱和 CloudBase 服务端密钥绝不能添加 `NEXT_PUBLIC_` 前缀。
- AI 只提供整理和建议，最终选择始终由用户完成。

## 当前已知限制

- 淘宝、京东等网站可能阻止服务端读取商品链接，遇到时使用商品截图。
- 智谱免费模型可能限流；代码会自动切换备用模型，但极端拥堵时仍可能需要稍后再试。
- 本地演示数据只保存在当前 Node.js 进程内，重启会恢复种子数据。
- CloudBase Run 最小实例数为 0 时可能出现冷启动，正式展示可调为 1。
- Cloudflare/Miniflare 在部分 Windows 电脑上需要更新 Microsoft Visual C++ Redistributable；普通 Next.js 本地开发不受影响。
- 项目目前是黑客松原型，仍需要补充自动化测试、真实多账号回归和线上监控。

## 硬件

桌面花固件、ESP32-S3 圆屏、联网、灯环、震动和舵机说明见 [`hardware/README.md`](hardware/README.md)。第一次请先只完成圆屏烧录，再逐项添加硬件。
