# get-biji-api

biji.com (Get笔记) 客户端套件 monorepo —— 共享 SDK + CLI + MCP server。

## 结构

```
.
├── apps/
│   ├── cli/          @biji/cli   终端命令行 (biji)
│   └── mcp/          @biji/mcp   stdio MCP server (get-biji-mcp)
├── packages/
│   └── biji-client/  @biji/client  共享 SDK：HTTP + JWT 自动刷新 + SSE 流
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

依赖关系：`@biji/cli` 和 `@biji/mcp` 都通过 `workspace:*` 引用 `@biji/client`，后者集中管理 ~117 个 biji.com 端点函数和 auth 状态。新端点都从浏览器抓包逆向得到（见下文「逆向新端点」）。

## 安装与构建

需要 `pnpm@10+` 和 `node@18+`。

```bash
pnpm install
pnpm -r build          # 拓扑顺序：先 client，再 cli/mcp
```

开发模式（任意一端独立监听）：

```bash
pnpm dev:cli           # tsx watch apps/cli/src/cli.ts
pnpm dev:mcp           # tsx watch apps/mcp/src/index.ts
```

## CLI 用法

构建后通过 `node apps/cli/dist/cli.js <command>` 调用，或将其链接为 `biji`：

```bash
npm link --workspace @biji/cli   # 然后直接用 biji
```

### 认证

biji.com 用 JWT + refresh_token，存 `~/.config/get-biji/auth.json`，refresh_token 约 90 天有效，JWT 过期前自动刷新。

```bash
biji auth login          # 引导式（粘贴浏览器导出的 JSON）
biji auth status         # 查看当前 token 状态
biji auth show           # 打印原始 auth 文件
```

也支持环境变量覆盖 `BIJI_TOKEN` / `BIJI_REFRESH_TOKEN`（适合 CI 或服务器场景）。

### 笔记操作

```bash
biji write "今天的灵感..."                  # 写笔记，markdown 自动转 TipTap
biji write -t "标题" -f path/to/file.md
echo "笔记内容" | biji write

biji search "关键词" -n 15                  # 关键词全文搜索
biji get <prime_id>                          # 拉取并打印某条笔记
biji edit <id>                               # 用 $EDITOR 编辑
biji rm <prime_id>                           # 删除笔记（进入最近删除）

biji recycle list                            # 列出最近删除（近 90 天）
biji recycle restore <prime_id...>           # 还原笔记
biji recycle delete  <prime_id...> -y        # 永久删除（不可逆）
biji recycle clear   -y                      # 清空回收站（不可逆）

biji link "https://example.com/article"     # AI 解析链接生成笔记（流式）
biji link --quiet --json <url>
biji link -p "用一句话概括" --topic <topic_id> <url>   # 自定义 prompt + 落到 KB
```

### 知识库（KB / 知识库 sidebar）

biji.com 的「知识库」对应 SDK 里的 topic 系统 —— 一组带 `root_dir` 的 topic。CLI 把 `note_id ↔ resource_id` 的映射封装好了，平时只需传 note_id。

```bash
biji kb list                                                 # 列所有 topic（带 id_alias + 计数）
biji kb resources <topicIdAlias>                             # 列 topic 内的 resource

biji kb add <topicIdAlias> "笔记内容"  -t "标题"             # 新建笔记直接进 KB
biji kb add <topicIdAlias> -f path/to/file.md                # 从 markdown 文件
echo "..." | biji kb add <topicIdAlias>                      # 从 stdin

biji kb link <topicIdAlias> <url> -p "AI 提示词"             # AI 解析链接落到 KB（流式）
biji kb attach <topicIdAlias> <noteId...>                    # 把已有笔记加入 KB
biji kb remove <topicIdAlias> <noteId...>                    # 移出 KB（笔记本身不删）
biji kb move <fromAlias> <toAlias> <noteId...>               # 在 KB 之间搬运笔记
```

### 音视频上传

biji 的上传走 3 步：拿 OSS 预签名 → PUT 原始字节 → POST 触发 AI（ASR + 结构化笔记）。CLI 一条命令封装：

```bash
biji upload podcast.mp3                                      # 默认进 "全部笔记"
biji upload clip.mp4 --topic <topicIdAlias> -p "重点摘要"   # 进 KB topic
biji upload audio.m4a --duration 180000                      # 显式传时长（ms），更稳
biji upload --kind video screen.mkv                          # 强制按视频处理
```

文件扩展名自动识别 audio/video。`--duration` 不传时默认 0，biji 服务端会自己探时长（但对短文件可能失败，建议显式传）。

### 导出笔记

支持 `pdf / docx / md / mp3`（mp3 仅对音频类笔记生效）。biji 的导出是异步任务：先创建，再轮询，最后从 OSS presigned URL 下载。

```bash
biji export <noteId...>                                      # 创建任务，打印 task_id
biji export <noteId...> --wait                               # 阻塞到任务完成，打印 access_url
biji export <noteId...> -t md --download /tmp/exports        # 阻塞 + 下载到目录
biji export-status <taskId>                                  # 单独查任务状态
```

### Yoda AI 聊天（语义搜索）

跟 biji 自带的 Yoda AI 对话，自动 RAG 你的全部笔记。

```bash
biji chat list                              # 列出最近会话（带答案预览）
biji chat show <session_id>                 # 看某会话完整历史
biji chat "总结商业相关笔记"                 # oneshot，复用最近会话
biji chat -n "新主题：日本加息"              # 强制新建会话
biji chat -s <session_id> "再展开 AI 投资"   # 在指定会话里追问
biji chat                                   # 进入 REPL 多轮对话
```

REPL 内：`/quit` 退出，`/reset` 清空上下文（重置 parent_id）。

可选范围控制（默认只走笔记 RAG）：

```bash
--no-notes      关闭笔记 RAG
--web           启用 web 搜索
--dedao         启用得到知识库
```

## MCP server 用法

`@biji/mcp` 是 stdio MCP，注册了 ~81 个 biji 工具（笔记 / 标签 / topics / 知识库 / Yoda chat / AI 写作 / 媒体上传 / 导出 / Canvas 等）。

`~/.config/Claude/claude_desktop_config.json`（或 Claude Code MCP 配置）：

```json
{
  "mcpServers": {
    "get-biji": {
      "command": "node",
      "args": ["/absolute/path/to/get-biji-api/apps/mcp/dist/index.js"]
    }
  }
}
```

确保 `~/.config/get-biji/auth.json` 已就绪（先在 CLI 跑 `biji auth login` 即可）。

## @biji/client SDK 集成

如果你想在自己的 Node.js 工程里直接调用 biji API：

```ts
import {
  loadAuth, setAuthStorage, FileAuthStorage, MemoryAuthStorage,
  searchNotes, createNote, yodaChatStream,
} from "@biji/client";

// 1. 选择 auth storage（CLI/桌面用 File，HTTP server 用 Memory）
setAuthStorage(new FileAuthStorage());     // 默认就是它
loadAuth();                                 // 从文件 / env 加载 token

// 2. 调任意端点
const res = await searchNotes("商业", 1, 10);

// 3. 流式 Yoda
await yodaChatStream(
  {
    mode: "AUTO",
    notes: { select_all: true },
    web: false, dedao: false, study: false,
    topics: {}, selected_resources: [],
    parent_id: "", question: "总结一下", action: "next",
    session_id: "<existing-session-id>",
  },
  { onChunk: (text) => process.stdout.write(text) },
);
```

`AuthStorage` 可注入自己的实现（比如 Redis 多租户），适配 stdio MCP / HTTP MCP / fly.io 部署等场景。

## 逆向新端点（capture script）

biji.com 没有公开 API 文档，本仓库里的端点都是抓包反推的。`scripts/capture/` 里有一个 Playwright 脚本，用来在你操作 web 端时实时记录所有请求 + body，供后续映射成 SDK 函数。

### 首次准备

```bash
cd scripts/capture
pnpm install                # playwright
pnpm exec playwright install chromium   # 下载 ~92MB Chromium
```

### 抓包流程

```bash
# 1. 起脚本 — Chromium 弹窗，profile 持久化在 /tmp/biji-chromium-profile
node scripts/capture/capture.mjs

# 2. 在 Chromium 里登录 biji.com，导航到要观察的页面
# 3. 在另一个 terminal 里打 marker 分段日志（写到同一个 jsonl）
printf '{"kind":"marker","ts":%s,"label":"before-X"}\n' $(date +%s000) >> /tmp/biji-capture.jsonl
# … 在 web 端做一次目标操作 …
printf '{"kind":"marker","ts":%s,"label":"after-X"}\n' $(date +%s000) >> /tmp/biji-capture.jsonl

# 4. 提取这段的 POST / PUT / DELETE
awk '/"label":"before-X"/{f=1;next} /"label":"after-X"/{f=0} f' /tmp/biji-capture.jsonl \
  | grep -E '"method":"(POST|PUT|DELETE|PATCH)"' \
  | head -20

# 5. Ctrl+C 关脚本
```

请求过滤已经在脚本里写好：只记 `biji.com / trytalks.com / luojilab.com / iget.com` 四个域名的 XHR / fetch / SSE / WebSocket，跳过图片/字体/CSS 噪声。响应体 > 4KB 自动截断。

### 把抓到的端点变成 SDK 函数

观察 capture 输出的 4 个字段：

| 看 | 决定 SDK 里的 |
|------|---------------|
| URL host | 用哪个 base const（`NOTES_API` / `LEGACY_API` / `OPEN_API` / `YODA_API`） |
| URL path | 函数里的 path 字符串 |
| Method + body 形状 | 函数签名 + `request()`/`requestSSE()` 调用 |
| 关键 header（`X-Topic-Scope` / `X-Av` 等） | 传 `extraHeaders` |

历史上踩过的坑：
- 同一个端点在不同 host 上都通（`notes-api.biji.com` ↔ `get-notes.luojilab.com`）—— **以抓包里实际看到的那个为准**，否则可能因为路由策略偶发 4xx。
- `resource_id` 跟 `note_id` 不是一回事：前者是 topic 内的绑定 id（数字），后者是笔记本身的 id（字符串）。涉及 topic 的删除/移动用 `resource_id`。
- 异步任务（导出、上传 SSE、ASR）都有「先 POST 创建 → 再 GET 轮询 → 最后 OSS download」的 3-step 模式，单跑 POST 是不够的。

脚本本身 commit 到仓库，本地抓包产物（profile + jsonl）落在 `/tmp/biji-*`，不会污染工作区。`scripts/capture/node_modules/` 由顶层 `node_modules/` 规则忽略。

## 关键设计

- **流式 SSE 双形态**：`requestSSE(url, path, body, { onChunk })` 既可阻塞读全文（MCP），也可边收边吐 chunk（CLI），同一份代码两种 host。
- **Auth storage pluggable**：`AuthStorage` 接口 + `FileAuthStorage` / `MemoryAuthStorage`，未来上 fly.io 多租户写个 `RedisAuthStorage` 注入即可。
- **CommonJS + Node16 module resolution**：源码用 `import "./xxx.js"` 写法（即使源是 `.ts`），保持与 MCP/Node 双端的兼容。

## 技术栈

- TypeScript 5.9 (strict, ES2022 target, Node16 module)
- pnpm 10 workspaces
- Node 18+ (`fetch` / `ReadableStream` 内置)
- `@modelcontextprotocol/sdk` (MCP server)
- `commander` (CLI 框架)
- `zod` (MCP tool schemas)
