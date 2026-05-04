# Get笔记 MCP Server

MCP server for [Get笔记 (biji.com)](https://www.biji.com) — AI驱动的知识管理应用。

通过 Playwright 逆向分析前端 JS 构建，提供 **83 个工具**，覆盖笔记管理全功能。

## 安装

```bash
git clone https://github.com/Gitnapp/get-biji-mcp.git
cd get-biji-mcp
npm install
npm run build
```

### Claude Code 配置

```bash
# 推荐：CLI 一键添加
claude mcp add --scope user --transport stdio get-biji -- node /path/to/get-biji-mcp/dist/index.js

# 验证
claude mcp list
```

或手动编辑 `~/.claude.json`，在 `mcpServers` 中添加：

```json
{
  "get-biji": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/get-biji-mcp/dist/index.js"],
    "env": {}
  }
}
```

也可以通过环境变量预配置认证（见下方认证说明）：

```json
{
  "get-biji": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/get-biji-mcp/dist/index.js"],
    "env": {
      "BIJI_TOKEN": "<jwt>",
      "BIJI_REFRESH_TOKEN": "<refresh_token>",
      "BIJI_TOKEN_EXPIRE_AT": "<timestamp>",
      "BIJI_REFRESH_TOKEN_EXPIRE_AT": "<timestamp>"
    }
  }
}
```

## 认证

JWT 有效期仅 30 分钟，需要 refresh_token（~90 天有效）实现自动续期。

**认证信息会自动持久化到 `~/.config/get-biji/auth.json`**，MCP 重启后自动加载，无需重复设置。

### 启动时加载优先级

1. **环境变量** — `BIJI_TOKEN` + `BIJI_REFRESH_TOKEN`（在 mcpServers `env` 中配置）
2. **持久化文件** — `~/.config/get-biji/auth.json`（由 `set_auth` 自动保存）
3. **手动设置** — 通过 `set_auth` / `set_token` 工具

### 首次设置（仅需一次）

1. 在浏览器登录 https://www.biji.com
2. 打开 DevTools → Console，执行：

```javascript
JSON.stringify({
  token: localStorage.getItem("token"),
  token_expire_at: Number(localStorage.getItem("token_expire_at")),
  refresh_token: localStorage.getItem("refresh_token"),
  refresh_token_expire_at: Number(localStorage.getItem("refresh_token_expire_at"))
})
```

3. 调用 `set_auth` 工具传入这 4 个值
4. 认证信息自动保存，之后重启 MCP 会自动加载
5. JWT 在过期前 5 分钟自动刷新，refresh_token 有效期约 90 天

### 其他认证方式

- **`set_token`** — 仅设置 JWT，无自动刷新，30 分钟后过期
- **`send_sms_code` + `login_with_sms`** — 短信验证码登录
- **`get_auth_status`** — 查看当前认证状态和过期时间

## API 端点

| Base URL | 用途 |
|----------|------|
| `https://notes-api.biji.com` | 主 API（笔记、标签、回收站、同步、知识库） |
| `https://knowledge-api.trytalks.com` | 开放 API（话题、团队、关注、目录） |
| `https://yoda-release.biji.com` | Yoda AI（对话、写作、风格、画布） |
| `https://get-notes.luojilab.com` | 旧版 API（前端用于 AI 流式笔记创建） |

认证 Header：`Authorization: Bearer <JWT>` + `X-Appid: 3`

## 提供的工具 (83)

### 认证 & 用户
| 工具 | 说明 |
|------|------|
| `set_auth` | 设置完整认证信息（含 refresh_token，支持自动刷新） |
| `set_token` | 设置 Bearer Token（无自动刷新） |
| `get_auth_status` | 查看当前认证状态（Token 过期时间等） |
| `send_sms_code` | 发送短信验证码 |
| `login_with_sms` | 短信验证码登录 |
| `get_user_info` | 获取当前用户信息 |

### 笔记
| 工具 | 说明 |
|------|------|
| `list_notes` | 列出笔记（分页） |
| `get_note` | 获取单条笔记 |
| `search_notes` | 搜索笔记 |
| `search_knowledge_notes` | 知识库搜索 |
| `get_notes_count` | 获取笔记总数 |
| `get_prompt_templates` | 获取 AI Prompt 模板 |
| `create_note` | 创建笔记 |
| `create_note_in_topic` | 在话题中创建笔记 |

### 回收站
| 工具 | 说明 |
|------|------|
| `list_recycled_notes` | 列出回收站笔记 |
| `restore_recycled_notes` | 恢复笔记 |
| `delete_recycled_notes` | 永久删除 |
| `clear_recycle_bin` | 清空回收站 |

### 标签
| 工具 | 说明 |
|------|------|
| `list_tags` / `search_tags` | 列出 / 搜索标签 |
| `get_tag_notes` | 获取标签下笔记 |
| `create_tag` / `delete_tag` | 创建 / 删除标签 |

### 话题（笔记本）
| 工具 | 说明 |
|------|------|
| `list_topics` / `list_my_topics` | 列出话题 |
| `get_topic_detail` | 话题详情 |
| `create_topic` / `edit_topic` / `delete_topic` | 话题 CRUD |
| `search_my_topics` | 搜索话题 |
| `list_topic_resources` | 列出话题资源 |
| `get_topics_by_note` | 查看笔记所属话题 |

### 话题目录
| 工具 | 说明 |
|------|------|
| `create_topic_directory` | 创建目录 |
| `edit_topic_directory` | 编辑目录 |
| `delete_topic_directory` | 删除目录 |

### 关注
| 工具 | 说明 |
|------|------|
| `list_follows` / `create_follow` / `delete_follow` | 关注源管理 |
| `get_follow_posts` | 获取关注源内容 |

### 团队
| 工具 | 说明 |
|------|------|
| `list_teams` / `get_team_info` / `create_team` | 团队管理 |

### 导出 & 分享
| 工具 | 说明 |
|------|------|
| `export_notes` / `list_export_tasks` | 导出笔记 |
| `get_shared_note` | 获取分享笔记 |
| `get_search_history` | 搜索历史 |

### OpenAPI Token
| 工具 | 说明 |
|------|------|
| `list_openapi_tokens` / `create_openapi_token` | 管理 OpenAPI Token |

### AI：链接智能分析
| 工具 | 说明 |
|------|------|
| `ai_analyze_link` | AI 智能分析 URL，自动生成深度笔记（支持小红书、微信文章等） |

### AI：笔记分析
| 工具 | 说明 |
|------|------|
| `get_note_link_details` | 获取笔记中的链接详情 |
| `ai_generate_tags` | AI 自动生成标签 |
| `add_note_tags` / `remove_note_tag` | 添加 / 移除笔记标签 |
| `get_related_notes` | 获取相关笔记推荐 |
| `get_note_original` | 获取笔记原始内容 |
| `create_note_stream` | AI 流式创建笔记 |
| `create_topic_note_stream` | AI 流式创建话题笔记 |

### AI：Yoda 对话
| 工具 | 说明 |
|------|------|
| `yoda_create_chat` | 创建 AI 对话 |
| `yoda_list_chats` | 列出对话历史 |
| `yoda_get_chat_messages` | 获取对话消息 |
| `yoda_chat_entry` | 按入口获取对话 |
| `yoda_chat_stream` | 发送消息并获取 AI 流式回复 |
| `yoda_stop_stream` | 停止 AI 流式回复 |
| `yoda_startup_questions` | 获取 AI 推荐问题 |
| `yoda_startup_shortcuts` | 获取 AI 快捷操作 |
| `yoda_set_chat_title` | 设置对话标题 |
| `yoda_get_shared_chat` | 获取分享的对话 |
| `yoda_resource_config` | 获取资源上传配置 |
| `yoda_send_feedback` | 发送 AI 反馈 |
| `yoda_create_ai_note` | 通过 Yoda 创建 AI 笔记 |

### AI：写作 & 风格
| 工具 | 说明 |
|------|------|
| `ai_writing_stream` | AI 写作助手（流式） |
| `list_ai_writers` | 列出 AI 写手 |
| `ai_style_gen_stream` | AI 风格生成（流式） |
| `list_style_polishers` | 列出风格润色器 |
| `list_styles` / `create_style` / `update_style` / `delete_style` | 风格 CRUD |

### AI：画布 & 知识库
| 工具 | 说明 |
|------|------|
| `save_canvas` / `get_canvas_history` | 画布管理 |
| `list_knowledge_books` / `search_knowledge_books` | 知识库书籍 |
| `recognize_weixin_blogger` | 识别微信公众号博主 |
