import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { getNote, updateNote, NoteSummary, markdownToTipTap } from "../api.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function editInEditor(initial: string, suffix = ".md"): string {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const tmp = path.join(os.tmpdir(), `biji-edit-${Date.now()}${suffix}`);
  fs.writeFileSync(tmp, initial);
  try {
    const r = spawnSync(editor, [tmp], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`editor exited with status ${r.status}`);
    return fs.readFileSync(tmp, "utf-8");
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

export function registerEditCommand(program: Command): void {
  program
    .command("edit <id>")
    .description("Edit a note. <id> = note_id (numeric) or prime_id (slug). Default opens $EDITOR with current markdown.")
    .option("--append <text>", "append text to the end of the note")
    .option("--replace <text>", "replace the entire note content")
    .option("-f, --file <path>", "read replacement content from file")
    .option("-t, --title <title>", "set new title")
    .option("--json", "output raw API response")
    .action(async (id: string, opts: { append?: string; replace?: string; file?: string; title?: string; json?: boolean }) => {
      const fetched = await getNote(id);
      const cRaw = fetched?.c as Record<string, unknown> | undefined;
      const note = ((cRaw?.data as NoteSummary | undefined) ?? (cRaw as NoteSummary | undefined));
      if (!note?.prime_id) {
        console.error("Could not load note:", JSON.stringify(fetched).slice(0, 300));
        process.exit(1);
      }

      let newContent = note.content ?? "";
      if (opts.append !== undefined) {
        newContent = (note.content ?? "") + (note.content?.endsWith("\n") ? "" : "\n\n") + opts.append;
      } else if (opts.replace !== undefined) {
        newContent = opts.replace;
      } else if (opts.file) {
        newContent = fs.readFileSync(opts.file, "utf-8");
      } else {
        const piped = await readStdin();
        if (piped.trim()) {
          newContent = piped;
        } else {
          newContent = editInEditor(note.content ?? "");
        }
      }

      const payload: NoteSummary = {
        ...note,
        content: newContent,
        title: opts.title ?? note.title,
        json_content: markdownToTipTap(newContent),
      };
      const res = await updateNote(note.prime_id, payload);
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      console.log(`Note updated: ${note.title || "(untitled)"} [${note.prime_id}]`);
    });
}
