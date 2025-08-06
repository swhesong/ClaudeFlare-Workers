
# Claude API 代理 (Cloudflare Worker)

这是一个部署在 Cloudflare Workers 上的 Claude API 代理服务。它通过管理一个 `sessionKey` 池，实现了对 Claude API 请求的负载均衡、自动故障转移和无缝上下文管理，并提供了一个简单易用的 Web 管理面板。

**English**: This is a Claude API proxy service deployed on Cloudflare Workers. It manages a pool of `sessionKey` tokens to provide load balancing, automatic failover, and seamless context management for Claude API requests, complete with a user-friendly web UI.

---

## ✨ 核心特性 (Core Features)

-   **🚀 高可用性 (High Availability)**: 当某个 `sessionKey` 失效、额度用尽或遇到错误时，系统会自动切换到下一个可用的 `sessionKey` 并重试，对用户完全透明。
-   **🧠 智能上下文管理 (Intelligent Context Management)**: 在 API 请求因 `sessionKey` 问题而需要切换时，系统能自动保存并恢复对话上下文，确保多轮对话的连续性，用户体验无中断。
-   **🔑 Token 池管理 (Token Pool Management)**: 支持 "公共" 和 "管理员" 两级 `sessionKey` 池。管理员 `sessionKey` 拥有更高的使用优先级。
-   **🖥️ Web 管理面板 (Web Management UI)**: 提供直观的 Web 界面，用于添加、删除、查看、验证和管理所有 `sessionKey`。
-   **🔐 安全加固 (Enhanced Security)**: 管理员面板由密码保护，密码通过 Cloudflare 的 Secrets 进行安全设置，避免硬编码。
-   **☁️ Serverless 架构 (Serverless Architecture)**: 无需管理服务器，轻松部署到 Cloudflare 的全球网络，享受高可用性和低延迟。
-   **📊 状态验证 (Status Validation)**: 可一键验证所有 `sessionKey` 的有效性，并清理无效的 `sessionKey`。
-   **⚙️ 兼容原生 API (Native API Compatible)**: 完全兼容原生 Claude Messages API 格式，可无缝替换 API 端点。

## 🏗️ 架构图 (Architecture)

```
+-----------+        +--------------------------+        +--------------------+
|           |        |                          |        |   Cloudflare KV    |
|   User    |  --->  |   Cloudflare Worker      |  <---> |  (Session Keys &   |
| (Client)  |        |  (API Proxy & Web UI)    |        | Conversation Ctx)  |
|           |        |                          |        +--------------------+
+-----------+        +------------+-------------+
                                   |
                                   | (Proxied Request w/ Valid Key)
                                   v
                         +---------------------+
                         |                     |
                         |  Claude Backend API |
                         |                     |
                         +---------------------+
```

## 🚀 部署指南 (Deployment Guide)

您需要一个 Cloudflare 账户和 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)。

### 步骤 1: 克隆项目

```bash
git clone <your-repository-url>
cd <your-repository-directory>
```

### 步骤 2: 创建 KV Namespace

您需要一个 KV Namespace 来存储 `sessionKey`。

```bash
wrangler kv:namespace create SESSION_KEYS
```

该命令会返回 Namespace ID。请将其记录下来。

### 步骤 3: 配置 `wrangler.toml`

在项目根目录下创建一个 `wrangler.toml` 文件，并填入以下内容。请将 `name`, `id` 和 `preview_id` 替换为您的实际信息。

```toml
# wrangler.toml
name = "claude-proxy" # 您的 Worker 名称
main = "index.js" # 入口文件
compatibility_date = "2023-12-01"

# 绑定 KV Namespace
[[kv_namespaces]]
binding = "SESSION_KEYS"
id = "your_kv_namespace_id"           # 替换为上一步生成的 ID
preview_id = "your_kv_namespace_preview_id" # 替换为上一步生成的 Preview ID
```

### 步骤 4: 设置管理员密码

为了安全，请使用 Wrangler 的 `secret` 命令来设置管理员密码，而不是将其写入 `wrangler.toml`。

```bash
wrangler secret put ADMIN_PASSWORD
```

然后根据提示输入您想要设置的管理员密码。脚本将从环境变量中自动读取此密码。

### 步骤 5: 部署

```bash
wrangler deploy
```

部署成功后，您将获得一个 `workers.dev` 的 URL，这就是您的代理服务地址。

## 🛠️ 使用指南 (Usage Guide)

### 1. 访问管理面板

-   **管理面板首页**: `https://<your-worker-url>.workers.dev/api`
-   **Token 管理**: `https://<your-worker-url>.workers.dev/tokens`

首次访问 `/tokens` 页面时，您会看到管理员登录区域。输入您在部署时设置的密码即可解锁全部管理功能。

### 2. 添加 Session Keys

-   在 `/tokens` 页面，您可以向 "普通用户 Token" 或 "管理员 Token" 列表中批量添加 `sessionKey`。
-   **重要**: 为保证服务稳定，请在添加前使用 [Claude SessionKey Checker](https://z-hc.com) 等工具验证 `sessionKey` 的有效性。

### 3. 管理 Session Keys

-   **验证**: 管理员可以一键验证所有 `sessionKey` 的状态。
-   **删除**: 管理员可以删除单个 `sessionKey`，或批量清空无效、特定类型或所有 `sessionKey`。
-   **切换**: 您可以在 `/token` 页面手动选择一个 `sessionKey` 作为当前全局生效的 Key。

### 4. 使用 API 代理

将您应用中请求 Claude API 的地址替换为您的 Worker URL。

-   **API 端点**: `https://<your-worker-url>.workers.dev/v1/messages`

#### `curl` 示例:

```bash
curl -X POST https://<your-worker-url>.workers.dev/v1/messages \
-H "Content-Type: application/json" \
-d '{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "stream": false,
  "messages": [
    {"role": "user", "content": "你好，克劳德！你能做什么？"}
  ]
}'
```

系统会自动从您的 `sessionKey` 池中选择一个有效的 Key 来处理请求。如果请求失败，它会自动尝试使用其他 Key，直到请求成功或所有 Key 都尝试完毕。

## 📜 API 路由 (API Routes)

| 路径 (Path) | 方法 (Method) | 描述 (Description) |
| :---------- | :------------ | :----------------- |
| `/`         | `GET`/`POST`  | 重定向到第三方 Claude Web UI，并自动携带一个有效的 `sessionKey`。 |
| `/api`      | `GET`         | 显示管理面板首页，包含服务状态和使用说明。 |
| `/tokens`   | `GET`/`POST`  | Token 管理页面，用于查看、添加、删除和验证 `sessionKey`。 |
| `/token`    | `GET`/`POST`  | 手动切换当前全局使用的 `sessionKey`。 |
| `/v1/messages` | `POST`        | Claude Messages API 的代理端点。 |
| `/v1/messages` | `OPTIONS`     | 处理 CORS 预检请求。 |

## ⚖️ 许可证 (License)

本项目采用 [MIT License](./LICENSE) 授权。
