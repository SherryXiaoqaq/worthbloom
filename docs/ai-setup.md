# WorthBloom AI 助手配置

当前按能力拆分模型供应商：

- `glm-4.6v-flash`：读取商品截图并提取名称、价格、次数和有效期。
- `deepseek-v4-flash`：驱动 Pi Runtime 下的四个 AI 决策顾问及圆桌讨论。

模型只预填表单、整理观点，不会自动创建心愿，也不会代替用户点击最终决定。

## 1. 创建智谱 API Key

1. 打开 [智谱开放平台](https://open.bigmodel.cn/)。
2. 注册或登录后进入 API Keys 页面。
3. 创建一把项目专用密钥。不要把密钥发给朋友，也不要提交到 GitHub。

## 2. 本地配置

在项目根目录创建 `.env.local`，加入：

```env
ZHIPU_API_KEY=替换成你的真实密钥
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_VISION_MODEL=glm-4.6v-flash
ZHIPU_TEXT_MODEL=glm-4.7-flash
ZHIPU_VISION_FALLBACK_MODEL=glm-4v-flash
ZHIPU_TEXT_FALLBACK_MODEL=glm-4-flash-250414

OPENAI_NEXT_API_KEY=替换成 OpenAI Next Credits 创建的项目密钥
OPENAI_NEXT_BASE_URL=https://api.openai-next.com/v1
DEEPSEEK_AGENT_MODEL=deepseek-v4-flash
```

智谱配置用于截图等视觉识别；OpenAI Next 网关中的 `deepseek-v4-flash` 只用于 AI 决策顾问团。没有配置网关 Key 时，顾问团会进入明确标记的规则演示模式，不会借用视觉模型冒充 Agent 输出。

保存后必须重启开发服务器：

```powershell
pnpm.cmd dev:lan
```

`.env.local` 已被 `.gitignore` 排除，不会上传 GitHub。变量名不要添加 `NEXT_PUBLIC_`，否则密钥会进入浏览器代码。

## 3. 上线配置

部署到 CloudBase Run 或 Cloudflare 时，在项目的“环境变量 / Secrets”设置中添加上述配置项。`ZHIPU_API_KEY` 与 `OPENAI_NEXT_API_KEY` 必须设为 Secret；模型名和基础地址可以是普通服务端变量。不要把真实值写入仓库。

## 4. 使用与限制

- 心愿创建页可以只发链接、只发截图，或者两者一起发。
- 淘宝、京东等页面可能阻止服务器读取；遇到这种情况补一张商品详情截图即可。
- 截图支持 JPG、PNG、WebP，单张不超过 5MB。
- AI 识别结果必须由用户核对，尤其是限时价、会员价、定金和截止日期。
- 免费模型仍可能有速率限制，官方也可能调整免费政策；模型名均可通过环境变量替换，无需改代码。

官方参考：

- [GLM-4.6V-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash)
- [智谱模型概览](https://docs.bigmodel.cn/cn/guide/start/model-overview)
- [DeepSeek API 文档](https://api-docs.deepseek.com/)
- [OpenAI Next Credits 接入指南](https://open-dev.feishu.cn/docx/H78cdh48EoTsYvxnDbgcnSKAnGc)
