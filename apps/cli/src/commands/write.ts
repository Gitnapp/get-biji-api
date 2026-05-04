import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { createNote } from "../api.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function openEditor(): string {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const tmp = path.join(os.tmpdir(), `biji-${Date.now()}.md`);
  fs.writeFileSync(tmp, "# \n\n");
  try {
    const r = spawnSync(editor, [tmp], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`editor exited with status ${r.status}`);
    return fs.readFileSync(tmp, "utf-8");
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

export function registerWriteCommand(program: Command): void {
  program
    .command("write [content]")
    .description("Create a note. Source priority: arg > -f file > stdin > $EDITOR")
    .option("-f, --file <path>", "read content from a file")
    .option("-t, --title <title>", "note title (optional)")
    .option("--topic <topic_id>", "create note inside a topic")
    .option("--json", "output raw API response")
    .action(async (content: string | undefined, opts: { file?: string; title?: string; topic?: string; json?: boolean }) => {
      let body = content;
      if (!body && opts.file) body = fs.readFileSync(opts.file, "utf-8");
      if (!body) {
        const piped = await readStdin();
        if (piped.trim()) body = piped;
      }
      if (!body) body = openEditor();
      if (!body || !body.trim()) {
        console.error("No content provided.");
        process.exit(1);
      }
      const res = await createNote({ content: body, title: opts.title, topic_id: opts.topic });
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      const cRaw = res?.c as Record<string, unknown> | undefined;
      const note = ((cRaw?.data as Record<string, unknown> | undefined) ?? cRaw) as
        | { note_id?: string; prime_id?: string; title?: string }
        | undefined;
      if (!note?.note_id) {
        console.error("Create may have failed:", JSON.stringify(res).slice(0, 300));
        process.exit(1);
      }
      console.log(`Note created.`);
      console.log(`  id:    ${note.note_id}`);
      console.log(`  prime: ${note.prime_id ?? "—"}`);
      console.log(`  title: ${note.title || "(untitled)"}`);
    });
}
