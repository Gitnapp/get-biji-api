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

依赖关系：`@biji/cli` 和 `@biji/mcp` 都通过 `workspace:*` 引用 `@biji/client`，后者集中管理 ~120 个 biji.com 端点函数和 auth 状态。

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
biji rm <prime_id>                           # 移到回收站

biji link "https://example.com/article"     # AI 解析链接生成笔记（流式）
biji link --quiet --json <url>
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

`@biji/mcp` 是 stdio MCP，注册了 ~80 个 biji 工具（笔记/标签/topics/Yoda chat/AI 写作/Canvas 等）。

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
