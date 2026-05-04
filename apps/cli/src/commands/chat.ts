import { Command } from "commander";
import * as readline from "readline";
import {
  createYodaChat,
  getYodaChatMessages,
  listYodaChats,
  yodaChatStream,
} from "@biji/client";

interface YodaSession {
  id: string;
  title?: string;
  last_answer_digest?: string;
  updated_at?: string;
  upstream?: string;
  upstream_id?: string;
}

interface YodaListResp {
  c?: { items?: YodaSession[] };
}

interface YodaCreateResp {
  c?: { id?: string; session?: { id?: string } };
}

interface YodaMessage {
  message_id?: string;
  role?: string;
  content?: string;
  create_time?: number;
}

interface YodaMessagesResp {
  c?: { items?: YodaMessage[]; session?: YodaSession };
}

interface ChatBaseOptions {
  notes?: boolean;
  web?: boolean;
  dedao?: boolean;
}

function buildBody(sessionId: string, question: string, parentId: string, opts: ChatBaseOptions) {
  return {
    mode: "AUTO",
    notes: { select_all: opts.notes !== false },
    web: Boolean(opts.web),
    dedao: Boolean(opts.dedao),
    study: false,
    topics: {},
    selected_resources: [] as unknown[],
    parent_id: parentId,
    question,
    action: "next",
    session_id: sessionId,
  };
}

async function getMostRecentSession(): Promise<YodaSession | null> {
  const r = (await listYodaChats(undefined, 1)) as YodaListResp;
  return r?.c?.items?.[0] ?? null;
}

async function ensureSession(opts: { session?: string; new?: boolean }): Promise<{ sessionId: string; reused: boolean }> {
  if (opts.session) return { sessionId: opts.session, reused: true };
  if (!opts.new) {
    const recent = await getMostRecentSession();
    if (recent?.id) return { sessionId: recent.id, reused: true };
  }
  const r = (await createYodaChat("")) as YodaCreateResp;
  const id = r?.c?.id ?? r?.c?.session?.id;
  if (!id) throw new Error("createYodaChat: no session id in response\n" + JSON.stringify(r));
  return { sessionId: id, reused: false };
}

async function getLastAssistantMessageId(sessionId: string): Promise<string> {
  const r = (await getYodaChatMessages(sessionId, undefined, 50)) as YodaMessagesResp;
  const items = r?.c?.items ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].role === "assistant" && items[i].message_id) return items[i].message_id as string;
  }
  return "";
}

async function ask(sessionId: string, question: string, parentId: string, opts: ChatBaseOptions, stream: boolean): Promise<string> {
  const body = buildBody(sessionId, question, parentId, opts);
  const r = await yodaChatStream(body, stream ? { onChunk: (t) => process.stdout.write(t) } : undefined);
  if (!stream) process.stdout.write(r.content);
  return r.content;
}

async function repl(sessionId: string, opts: ChatBaseOptions): Promise<void> {
  console.log(`💬 chat session: ${sessionId}`);
  console.log(`(type /quit or Ctrl-D to exit, /reset to clear context)`);
  let parentId = await getLastAssistantMessageId(sessionId);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\nyou> " });
  rl.prompt();
  for await (const line of rl) {
    const text = line.trim();
    if (!text) { rl.prompt(); continue; }
    if (text === "/quit" || text === "/exit") break;
    if (text === "/reset") { parentId = ""; console.log("(context cleared)"); rl.prompt(); continue; }
    process.stdout.write("\nyoda> ");
    await ask(sessionId, text, parentId, opts, true);
    process.stdout.write("\n");
    parentId = await getLastAssistantMessageId(sessionId);
    rl.prompt();
  }
  rl.close();
}

async function readPipedStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8").trim();
}

export function registerChatCommand(program: Command): void {
  const chat = program
    .command("chat [message]")
    .description("Chat with Yoda AI over your notes (RAG-based semantic search)")
    .option("-s, --session <id>", "use specific session id (default: reuse most recent)")
    .option("-n, --new", "force-create a new session")
    .option("--no-notes", "disable note RAG (notes.select_all)")
    .option("--web", "enable web search")
    .option("--dedao", "enable Dedao knowledge base")
    .action(async (
      message: string | undefined,
      opts: { session?: string; new?: boolean; notes?: boolean; web?: boolean; dedao?: boolean },
    ) => {
      const piped = await readPipedStdin();
      const text = (message ?? piped).trim();
      const { sessionId, reused } = await ensureSession({ session: opts.session, new: opts.new });
      if (!opts.session && reused) console.error(`(reusing recent session ${sessionId})`);
      if (!reused) console.error(`(new session ${sessionId})`);

      if (!text) {
        if (process.stdin.isTTY) {
          await repl(sessionId, opts);
        } else {
          console.error("No message provided. Use: biji chat \"<message>\" or pipe text to stdin.");
          process.exit(1);
        }
        return;
      }
      const parentId = reused ? await getLastAssistantMessageId(sessionId) : "";
      await ask(sessionId, text, parentId, opts, true);
      process.stdout.write(`\n\n[session: ${sessionId}]\n`);
    });

  chat
    .command("list")
    .description("List recent Yoda chat sessions")
    .option("-n, --limit <num>", "max sessions", "10")
    .action(async (opts: { limit: string }) => {
      const limit = Number(opts.limit) || 10;
      const r = (await listYodaChats(undefined, limit)) as YodaListResp;
      const items = r?.c?.items ?? [];
      if (!items.length) {
        console.log("No Yoda sessions yet. Run: biji chat \"<message>\" to start one.");
        return;
      }
      for (const s of items) {
        console.log(`• ${s.title || "(untitled)"}`);
        console.log(`  ${s.id}  ${s.updated_at || ""}`);
        if (s.last_answer_digest) {
          const d = s.last_answer_digest.replace(/\s+/g, " ").trim().slice(0, 200);
          console.log(`  ${d}${s.last_answer_digest.length > 200 ? "..." : ""}`);
        }
        console.log("");
      }
    });

  chat
    .command("show <session>")
    .description("Show full message history of a Yoda session")
    .option("-n, --limit <num>", "max messages", "50")
    .action(async (sessionId: string, opts: { limit: string }) => {
      const limit = Number(opts.limit) || 50;
      const r = (await getYodaChatMessages(sessionId, undefined, limit)) as YodaMessagesResp;
      const items = r?.c?.items ?? [];
      const session = r?.c?.session;
      if (session) console.log(`# ${session.title || "(untitled)"}  [${session.id}]\n`);
      for (const m of items) {
        const ts = m.create_time ? new Date(m.create_time * 1000).toISOString().slice(0, 19).replace("T", " ") : "";
        console.log(`--- ${m.role || "?"}  ${ts}`);
        console.log(m.content || "");
        console.log("");
      }
    });
}
