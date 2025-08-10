
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

# Claude API 代理服务 - 用户部署说明书

📋 项目概述

这是一个基于 Cloudflare Workers 的 Claude API 代理服务，支持：

🔄 自动 Session Key 轮换和管理

💬 无缝上下文切换（对话不中断）

🛡️ 智能错误处理和重试机制

👥 多用户 Token 池管理

🎯 完全兼容 Claude API 接口

🚀 快速部署指南

第一步：准备 Cloudflare 环境

注册 Cloudflare 账号

访问 Cloudflare Dashboard

注册并登录账号

创建 Workers 项目

进入 Workers & Pages 页面

点击 Create application

选择 Create Worker

给项目起个名字（如：claude-api-proxy）

第二步：配置 KV 存储

创建 KV 命名空间

# 在 Cloudflare Dashboard 中操作
Workers & Pages → KV → Create namespace

命名空间名称：SESSION_KEYS

记录下创建的 Namespace ID

绑定 KV 到 Worker

在 Worker 设置页面找到 Variables and Secrets

添加 KV 绑定：

Variable name: SESSION_KEYS

KV namespace: 选择刚创建的命名空间

第三步：配置环境变量

在 Worker 的 Variables and Secrets 中添加：

变量名

类型

值

说明

ADMIN_PASSWORD

Environment Variable

你的管理员密码

⚠️ 必须修改

重要提醒：

// 代码中的默认密码必须修改！
ADMIN_PASSWORD: 'XXXX',  // ← 替换成你的安全密码

第四步：部署代码

复制完整代码

将附件中的完整代码复制到 Worker 编辑器

必须修改的配置项

🔐 安全配置（必改）

const CONFIG = {
  // ⚠️ 必须修改管理员密码
  ADMIN_PASSWORD: '你的强密码',  // 改成复杂的密码
  
  // 其他配置保持默认即可
  CACHE_TTL: 60,
  VALID_KEY_TTL: 300,
  // ...
}

🌐 API 端点配置（可选修改）

API_ENDPOINTS: {
  CLAUDE_OFFICIAL: 'https://api.claude.ai/api/organizations',
  CLAUDE_API: 'https://api.claude.ai',
  FUCLAUDE_AUTH: 'https://demo.xxxx.com/api/auth/session',      // 如需更换
  FUCLADUE_MESSAGES: 'https://demo.xxxx.com/v1/messages',      // 如需更换
  FUCLAUDE_LOGIN: 'https://demo.xxxx.com/login_token'          // 如需更换
}

保存并部署

点击 Save and Deploy

等待部署完成

⚙️ 初始配置

获取你的代理地址

部署成功后，你会得到一个地址，格式如：

https://your-worker-name.your-subdomain.workers.dev

第一次使用

访问管理面板

https://your-worker-name.your-subdomain.workers.dev/api

添加 Session Keys

点击 Token 管理

使用管理员密码登录

批量添加你的 Claude Session Keys

🔑 Session Key 获取方法

方法一：浏览器获取

登录 Claude.ai

打开浏览器开发者工具（F12）

找到 Application/Storage → Cookies → https://claude.ai

复制 sessionKey 的值（以 sk-ant-sid01- 开头）

方法二：抓包获取

使用抓包工具监听 Claude.ai 的请求

在请求头中找到 Cookie 字段

提取其中的 sessionKey=sk-ant-sid01-... 部分

⚠️ Session Key 注意事项

Session Key 格式：必须以 sk-ant-sid01- 开头

有效期：通常为几个月，过期后需要重新获取

安全性：不要泄露给他人，相当于你的账号密码

📝 使用说明

API 调用方式

将你的 Claude API 请求地址替换为：

https://your-worker-name.your-subdomain.workers.dev/v1/messages

示例代码

curl 请求

curl -X POST https://your-worker-name.your-subdomain.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, Claude!"}
    ]
  }'

Python 请求

import requests

url = "https://your-worker-name.your-subdomain.workers.dev/v1/messages"
headers = {"Content-Type": "application/json"}
data = {
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [
        {"role": "user", "content": "Hello, Claude!"}
    ]
}

response = requests.post(url, headers=headers, json=data)
print(response.json())

JavaScript 请求

const response = await fetch('https://your-worker-name.your-subdomain.workers.dev/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-3-sonnet-20240229',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'Hello, Claude!' }
    ]
  })
});

const data = await response.json();
console.log(data);

🛠️ 管理功能

访问管理面板

https://your-domain/api          # 主管理面板
https://your-domain/tokens       # Token 管理
https://your-domain/token        # 快速切换 Token

Token 管理功能

普通用户功能

✅ 添加普通用户 Session Keys

✅ 查看所有普通 Keys（截断显示）

✅ 复制 Keys 到剪贴板

管理员功能（需要密码）

✅ 所有普通用户功能

✅ 添加/删除管理员 Session Keys

✅ 批量验证所有 Keys 有效性

✅ 删除无效 Keys

✅ 清空指定类型或所有 Keys

Key 验证方式

Fuclaude网站验证（推荐）

更快速、更可靠

通过第三方接口验证

官方API验证

直接调用 Claude 官方 API

可能受到限制

🔄 自动切换机制

智能 Token 管理

🎯 优先级: 管理员 Token > 普通用户 Token

🔄 自动轮换: Token 失效时自动切换到下一个可用 Token

💾 上下文保持: 切换过程中完整保留对话历史

🔁 重试机制: 最多重试 5 次，确保服务可用性

无缝对话切换

当聊天过程中 Token 用完时：

系统自动检测到 Token 失效

立即切换到下一个可用 Token

完整保留之前的对话上下文

用户感受不到任何中断

对话无缝继续

⚠️ 重要注意事项

安全警告

管理员密码: 务必修改默认密码 96582666Ss

Session Key 安全: 不要在公共场所或不安全的网络环境下操作

定期检查: 建议定期检查和更新失效的 Session Keys

性能优化

Token 数量: 建议维护 5-10 个有效 Session Keys

缓存设置: 默认缓存 60 秒，可根据需要调整

监控使用: 定期查看 Cloudflare Workers 的使用量

使用限制

Cloudflare Workers 限制:

免费版：每天 100,000 次请求

付费版：无限制

Claude API 限制:

取决于你的 Claude 账号类型和配额

故障排除

常见问题

1. “No valid session keys found” 错误

原因：所有 Session Keys 都已失效

解决：添加新的有效 Session Keys

2. 管理员密码错误

原因：未修改默认密码或输入错误

解决：检查代码中的 ADMIN_PASSWORD 设置

3. CORS 错误

原因：跨域请求问题

解决：代码已内置 CORS 处理，确保请求格式正确

4. 上下文切换失败

原因：KV 存储未正确配置

解决：检查 KV 命名空间绑定是否正确

🔧 高级配置

自定义配置选项

const CONFIG = {
  // 缓存设置
  CACHE_TTL: 60,                    // 缓存时间（秒）
  VALID_KEY_TTL: 300,              // 有效Key缓存时间（秒）
  
  // 上下文管理
  CONTEXT_MANAGEMENT: {
    MAX_CONTEXT_MESSAGES: 50,       // 最大上下文消息数
    AUTO_CLEANUP_DAYS: 7,          // 自动清理天数
    SEAMLESS_SWITCH_ENABLED: true, // 启用无缝切换
  },
  
  // 自动切换
  AUTO_SWITCH: {
    ENABLED: true,                 // 启用自动切换
    MAX_RETRY_ATTEMPTS: 5,         // 最大重试次数
    RETRY_DELAY_MS: 1000,          // 重试延迟（毫秒）
  },
  
  // 分页设置
  ITEMS_PER_PAGE: 10,              // 每页显示的Token数量
}

监控和日志

服务会自动记录详细日志，包括：

Token 切换事件

API 请求状态

错误和重试信息

上下文保存/恢复操作

可以在 Cloudflare Dashboard 的 Real-time Logs 中查看。

📞 技术支持

常用链接

Cloudflare Workers 文档

Claude API 文档

KV 存储文档

更新和维护

定期检查 Session Keys 的有效性

监控 Cloudflare Workers 的使用量

根据需要调整配置参数

备份重要的配置和 Keys

🎉 部署完成检查清单

 ✅ 已创建 Cloudflare Workers 项目

 ✅ 已创建并绑定 KV 命名空间 SESSION_KEYS

 ✅ 已修改默认管理员密码

 ✅ 已部署代码到 Workers

 ✅ 已获取至少 1 个有效的 Claude Session Key

 ✅ 已通过管理面板添加 Session Keys

 ✅ 已测试 API 调用功能

 ✅ 已测试上下文无缝切换功能

完成以上步骤后，你的 Claude API 代理服务就可以正常使用了！享受无缝的 AI 对话体验吧！ 🚀
