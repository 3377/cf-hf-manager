# HF Space Manager

HF Space Manager 是一个用于管理 Hugging Face Spaces 的管理面板，基于 Cloudflare Pages Functions 构建。

## 功能特点

- 查看所有 Spaces 的列表和状态
- 重启和重建 Spaces
- 实时监控 Spaces 的资源使用情况
- 用户认证和授权
- 响应式设计，支持桌面和移动设备
- 多用户多令牌支持
- 外部API访问接口

## 项目结构

```
hf-space-manager-pages/
├── functions/             # Cloudflare Pages Functions
│   ├── api/
│   │   ├── config.js      # 配置信息 API
│   │   ├── helpers.js     # 共享辅助函数
│   │   ├── proxy/
│   │   │   ├── spaces.js  # Spaces 列表获取
│   │   │   ├── restart.js # 重启 Space
│   │   │   ├── rebuild.js # 重建 Space
│   │   │   ├── metrics.js # 实时监控处理
│   │   │   ├── live-metrics-stream.js # 实时监控流
│   │   │   ├── update-subscriptions.js # 更新订阅
│   │   ├── v1/            # API v1
│   │       ├── login.js   # 登录API
│   │       ├── logout.js  # 登出API
│   │       ├── verify.js  # 验证会话API
│   │       ├── verifyToken.js # 验证令牌API
│   │       ├── info.js    # 系统信息API
│   │       ├── action.js  # 执行操作API
│   │       ├── external/  # 外部API接口
│   │       │   ├── _middleware.js # 外部API中间件
│   │       │   ├── info.js # 外部API信息
│   │       │   ├── spaces.js # 获取空间列表
│   │       │   ├── spaces/[username].js # 获取特定用户的空间列表
│   │       │   ├── spaces/[id].js # 获取特定空间详情
│   │       │   ├── action/[spaceId]/restart.js # 重启空间
│   │       │   ├── action/[spaceId]/rebuild.js # 重建空间
│   │       ├── _middleware.js # API v1中间件
│   └── _middleware.js     # 全局中间件
├── public/                # 静态前端文件
│   ├── index.html        # HTML页面
│   ├── styles.css        # CSS样式
│   └── scripts.js        # 前端脚本
└── wrangler.toml         # Cloudflare配置文件
```

## 部署前提

1. 拥有 Cloudflare 账户
2. 已安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
   ```bash
   npm install -g wrangler
   ```
3. 已登录 Wrangler
   ```bash
   wrangler login
   ```
4. 拥有 Hugging Face 账户和 API 令牌（可在 [HuggingFace - Settings - Access Tokens](https://huggingface.co/settings/tokens) 获取）

## 环境变量

在 Cloudflare Pages 控制台中设置以下环境变量：

| 变量名 | 描述 | 必填 | 示例 |
|------|------|------|------|
| `HF_USERNAME` | 管理面板登录用户名 | 是 | `admin` |
| `HF_PASSWORD` | 管理面板登录密码 | 是 | `your-secure-password` |
| `HF_USER` | HuggingFace用户和API Token映射，格式为`username:token`，多个用户用逗号分隔 | 与HF_API_TOKEN二选一 | `user1:token1,user2:token2` |
| `HF_API_TOKEN` | 全局Hugging Face API令牌，当HF_USER未配置或未提供特定用户令牌时使用 | 与HF_USER二选一 | `hf_xxxxxxxxxxxxxxxxxxxx` |
| `HF_USERNAMES` | 以逗号分隔的用户名列表，用于过滤Spaces（如果设置了HF_USER则可以省略） | 否 | `user1,user2,user3` |
| `API_KEY` | 外部API访问密钥，用于第三方应用通过API访问和管理Spaces | 否 | `your-api-key` |

> **重要提示**: 
> - 环境变量需要为生产和预览环境分别设置。通常建议至少为生产环境设置这些变量。
> - 如果你管理多个用户的Spaces，推荐使用HF_USER设置每个用户对应的令牌，这样系统会自动使用正确的令牌操作相应用户的Spaces。
> - 如果只管理单个用户的Spaces，可以只设置HF_API_TOKEN。
> - 如果要允许外部应用访问API，请设置API_KEY并保持安全。

## 多用户令牌映射

本项目支持多用户多令牌映射，使得一个管理面板可以管理多个HuggingFace用户的Spaces，并使用各自的API令牌进行操作。

### 工作原理

1. 通过`HF_USER`环境变量配置用户和令牌的映射关系，格式为：`username1:token1,username2:token2`
2. 当获取Spaces列表时，系统会使用每个用户的令牌获取其Spaces
3. 当操作（重启/重建）某个Space时，系统会自动使用该Space所属用户的令牌

### 示例配置

如果你想管理两个用户（user1和user2）的Spaces：

```
HF_USER=user1:hf_token_for_user1,user2:hf_token_for_user2
```

如果某个用户没有提供令牌，系统会尝试使用全局令牌（HF_API_TOKEN）：

```
HF_USER=user1:hf_token_for_user1,user2:
HF_API_TOKEN=hf_fallback_token
```

在这个例子中，user1的操作会使用其专用令牌，而user2的操作会使用全局令牌。

## 外部API使用

本项目提供了一组外部API，允许第三方应用通过API调用访问和管理Spaces。这些API使用Bearer令牌认证方式，需要在请求头中包含`Authorization: Bearer <API_KEY>`进行认证。

### API基础信息

- **基础URL**：`https://<your-domain>/api/v1/external`
- **认证方式**：在请求头中设置 `Authorization: Bearer <API_KEY>`
- **内容类型**：`Content-Type: application/json`

### API端点列表

#### 1. 获取系统信息

- **URL**：`/info`
- **方法**：`GET`
- **描述**：获取系统信息和可用API端点列表

#### 2. 获取所有Spaces

- **URL**：`/spaces`
- **方法**：`GET`
- **描述**：获取所有可用的Spaces列表

#### 3. 获取特定用户的Spaces

- **URL**：`/spaces/:username`
- **方法**：`GET`
- **描述**：获取特定用户的Spaces列表

#### 4. 获取特定Space详情

- **URL**：`/spaces/:id`
- **方法**：`GET`
- **描述**：获取特定Space的详细信息

#### 5. 重启Space

- **URL**：`/action/:spaceId/restart`
- **方法**：`POST`
- **描述**：重启指定的Space

#### 6. 重建Space

- **URL**：`/action/:spaceId/rebuild`
- **方法**：`POST`
- **描述**：重建指定的Space

### 使用示例

使用curl调用API示例：

```bash
# 获取系统信息
curl -X GET "https://your-domain.pages.dev/api/v1/external/info" \
  -H "Authorization: Bearer your-api-key"

# 获取所有Spaces
curl -X GET "https://your-domain.pages.dev/api/v1/external/spaces" \
  -H "Authorization: Bearer your-api-key"

# 获取特定用户的Spaces
curl -X GET "https://your-domain.pages.dev/api/v1/external/spaces/username" \
  -H "Authorization: Bearer your-api-key"

# 重启Space
curl -X POST "https://your-domain.pages.dev/api/v1/external/action/username/space-name/restart" \
  -H "Authorization: Bearer your-api-key"
```

## 详细部署步骤

### 1. 克隆代码库

```bash
git clone https://github.com/yourusername/hf-space-manager-pages.git
cd hf-space-manager-pages
```

### 2. 创建 KV 命名空间

KV 命名空间用于存储用户会话数据。这对于应用的认证功能是必需的。

```bash
# 为生产环境创建KV命名空间
wrangler kv:namespace create SESSIONS

# 为预览环境创建KV命名空间（可选）
wrangler kv:namespace create SESSIONS --preview
```

执行命令后，你将获得类似以下的输出：

```
✓ Created namespace "SESSIONS" (id: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
```

记下这个ID，你需要将它更新到 `wrangler.toml` 文件中。

### 3. 更新 wrangler.toml 配置

编辑 `wrangler.toml` 文件，将 KV 命名空间的 ID 替换为你刚才获得的实际 ID：

```toml
kv_namespaces = [
  { binding = "SESSIONS", id = "你的KV命名空间ID", preview_id = "你的预览KV命名空间ID" }
]
```

### 4. 本地测试（可选）

```bash
wrangler pages dev
```

这将启动一个本地开发服务器，通常在 http://localhost:8788 访问。

### 5. 部署到 Cloudflare Pages

有两种方式部署：

#### 方式一：通过 Wrangler CLI 部署

```bash
# 构建静态文件（如果有构建步骤）
# npm run build

# 部署到Cloudflare Pages
wrangler pages publish public
```

#### 方式二：通过 Git 集成部署（推荐）

1. 将代码推送到 GitHub、GitLab 或 Bitbucket 仓库
   ```bash
   git add .
   git commit -m "准备部署到Cloudflare Pages"
   git push origin main
   ```

2. 在 Cloudflare Dashboard 中创建新的 Pages 项目：
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 进入 "Pages" 选项
   - 点击 "创建应用程序" 或 "连接到 Git"
   - 选择你的仓库并按照向导操作
   - 部署设置中，设置构建命令为 `npm run build`（如果有构建步骤）或留空
   - 设置构建输出目录为 `public`

3. 设置 KV 绑定：
   - 在项目的 "设置" > "Functions" 中找到 "KV 命名空间绑定"
   - 添加绑定：变量名填写 `SESSIONS`，命名空间选择你之前创建的命名空间

4. 设置环境变量：
   - 在项目的 "设置" > "环境变量" 中添加必要的环境变量（见上文环境变量表格）

### 6. 验证部署

部署完成后，访问你的 Cloudflare Pages 站点（通常格式为 `https://your-project-name.pages.dev`）。

## 常见问题排查

1. **登录失败**
   - 检查 `HF_USERNAME` 和 `HF_PASSWORD` 环境变量是否正确设置
   - 确认 KV 命名空间是否正确绑定

2. **获取 Spaces 列表失败**
   - 验证 `HF_USER` 或 `HF_API_TOKEN` 环境变量是否正确
   - 检查 API 令牌是否有足够的权限
   - 如果使用 `HF_USER`，检查格式是否正确（必须是 `username:token` 格式）

3. **外部API访问失败**
   - 确认 `API_KEY` 环境变量已正确设置
   - 验证请求头是否包含正确的 `Authorization: Bearer <API_KEY>` 格式
   - 检查请求的URL路径是否正确

4. **实时监控不工作**
   - 检查浏览器控制台是否有 SSE 连接错误
   - 验证 API 令牌是否有访问监控指标的权限

## API 文档

### 认证 API

#### POST /api/v1/login
用户登录并获取会话令牌

#### POST /api/v1/logout
用户登出，销毁会话

#### GET /api/v1/verify
验证会话有效性

#### GET /api/v1/verifyToken
验证令牌

### 代理 API

#### GET /api/proxy/spaces
获取 Spaces 列表

#### POST /api/proxy/restart/:spaceId
重启指定的 Space

#### POST /api/proxy/rebuild/:spaceId
重建指定的 Space

#### GET /api/proxy/metrics?spaceId=:spaceId
获取指定 Space 的资源使用情况

#### GET /api/proxy/live-metrics-stream?instances=:spaceIds
获取多个 Space 的实时资源使用情况流

#### POST /api/proxy/update-subscriptions
更新监控订阅

### 外部 API

#### GET /api/v1/external/info
获取系统信息和可用API端点列表

#### GET /api/v1/external/spaces
获取所有可用的Spaces列表

#### GET /api/v1/external/spaces/:username
获取特定用户的Spaces列表

#### GET /api/v1/external/spaces/:id
获取特定Space的详细信息

#### POST /api/v1/external/action/:spaceId/restart
重启指定的Space

#### POST /api/v1/external/action/:spaceId/rebuild
重建指定的Space

### 其他 API

#### GET /api/config
获取系统配置信息

#### GET /api/v1/info
获取系统信息

#### POST /api/v1/action
执行操作

## 许可证

MIT 