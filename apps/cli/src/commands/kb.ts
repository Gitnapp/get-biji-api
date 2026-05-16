import { Command } from "commander";
import * as fs from "fs";
import {
  addNoteToTopic,
  aiAnalyzeLink,
  attachNotesToTopic,
  listKbResources,
  listKbTopics,
  moveResourceBetweenTopics,
  removeResourceFromKb,
  resolveNoteIdsToResourceIds,
  type KbTopic,
} from "../api.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function pickTopic(list: KbTopic[] | undefined, id: string): KbTopic | undefined {
  if (!list) return undefined;
  return list.find((t) => t.id_alias === id || String(t.id) === id);
}

async function resolveTopic(idOrAlias: string): Promise<{ topic_id: string; topic_directory_id: string; name: string }> {
  const res = await listKbTopics(1, 50);
  const list = res?.c?.list;
  const t = pickTopic(list, idOrAlias);
  if (!t) {
    const known = list?.map((x) => `${x.id_alias} (${x.name})`).join(", ") ?? "(none)";
    throw new Error(`KB topic not found: ${idOrAlias}\nAvailable: ${known}`);
  }
  return {
    topic_id: String(t.id),
    topic_directory_id: String(t.root_dir?.id ?? ""),
    name: t.name,
  };
}

export function registerKbCommand(program: Command): void {
  const kb = program.command("kb").description("Knowledge-base (知识库) topics: list / add / link");

  kb.command("list")
    .description("List your KB topics (the ones shown in biji.com 知识库 sidebar)")
    .option("--json", "raw JSON output")
    .action(async (opts: { json?: boolean }) => {
      const res = await listKbTopics();
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      const list = res?.c?.list ?? [];
      if (!list.length) {
        console.log("(no KB topics)");
        return;
      }
      for (const t of list) {
        const stats = t.extend_data?.stats_info ?? "";
        console.log(`${t.id_alias.padEnd(10)} ${t.name}${stats ? `  · ${stats}` : ""}`);
      }
    });

  kb.command("resources <topicIdAlias>")
    .description("List resources inside a KB topic's root directory")
    .option("--page <n>", "page number", "1")
    .option("--directory <dirId>", "override directory id (defaults to topic root_dir)")
    .option("--json", "raw JSON output")
    .action(async (alias: string, opts: { page?: string; directory?: string; json?: boolean }) => {
      const meta = await resolveTopic(alias);
      const dirId = opts.directory ?? meta.topic_directory_id;
      const res = await listKbResources(alias, dirId, { page: Number(opts.page ?? 1) });
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      const data = res?.c as { resources?: Array<{ resource_type: string; add_desc: string; resource_note_meta_data?: { title?: string; note_id?: string }; resource_file_meta_data?: { name?: string; id?: string } }> } | undefined;
      const resources = data?.resources ?? [];
      console.log(`Topic: ${meta.name} (dir=${dirId}) · ${resources.length} item(s)`);
      for (const r of resources) {
        const title = r.resource_note_meta_data?.title || r.resource_file_meta_data?.name || "(untitled)";
        const id = r.resource_note_meta_data?.note_id || r.resource_file_meta_data?.id || "";
        console.log(`  [${r.resource_type}] ${title}${id ? `  · ${id}` : ""}  ${r.add_desc}`);
      }
    });

  kb.command("add <topicIdAlias> [content]")
    .description("Add a plain-text / markdown note into a KB topic. Source priority: arg > -f file > stdin")
    .option("-f, --file <path>", "read content from a file")
    .option("-t, --title <title>", "note title (optional)")
    .option("--directory <dirId>", "directory id under the topic; defaults to topic root_dir")
    .option("--json", "output raw API response")
    .action(async (alias: string, content: string | undefined, opts: { file?: string; title?: string; directory?: string; json?: boolean }) => {
      let body = content;
      if (!body && opts.file) body = fs.readFileSync(opts.file, "utf-8");
      if (!body) {
        const piped = await readStdin();
        if (piped.trim()) body = piped;
      }
      if (!body || !body.trim()) {
        console.error("No content provided. Pass content as arg, -f file, or via stdin.");
        process.exit(1);
      }
      const meta = await resolveTopic(alias);
      const res = await addNoteToTopic({
        topic_id: meta.topic_id,
        topic_directory_id: opts.directory ?? meta.topic_directory_id,
        content: body,
        title: opts.title,
      });
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      const note = res?.c;
      console.log(`Note created in KB「${meta.name}」.`);
      console.log(`  id:    ${note?.note_id ?? "—"}`);
      console.log(`  prime: ${note?.prime_id ?? "—"}`);
      console.log(`  title: ${note?.title || "(untitled)"}`);
    });

  kb.command("remove <topicIdAlias> <noteIds...>")
    .description("Remove notes from a KB topic (the note itself stays in 'all notes')")
    .option("--directory <dirId>", "directory id to search resources in; defaults to topic root_dir")
    .option("--by-resource-id", "treat <noteIds> as resource_ids (skip note→resource lookup)")
    .option("--json", "raw JSON output")
    .action(async (alias: string, ids: string[], opts: { directory?: string; byResourceId?: boolean; json?: boolean }) => {
      const meta = await resolveTopic(alias);
      let resourceIds: Array<{ note_id?: string; resource_id: number }>;
      if (opts.byResourceId) {
        resourceIds = ids.map((rid) => ({ resource_id: Number(rid) }));
      } else {
        const dirId = opts.directory ?? meta.topic_directory_id;
        const map = await resolveNoteIdsToResourceIds(alias, dirId, ids);
        const missing = ids.filter((n) => !map.has(n));
        if (missing.length) {
          console.error(`Note(s) not found in KB「${meta.name}」: ${missing.join(", ")}`);
          process.exit(1);
        }
        resourceIds = ids.map((n) => ({ note_id: n, resource_id: map.get(n)! }));
      }
      const results: Array<{ resource_id: number; note_id?: string; ok: boolean; error?: string }> = [];
      for (const r of resourceIds) {
        try {
          await removeResourceFromKb(r.resource_id, meta.topic_id);
          results.push({ ...r, ok: true });
        } catch (e) {
          results.push({ ...r, ok: false, error: (e as Error).message });
        }
      }
      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      const ok = results.filter((r) => r.ok).length;
      console.log(`Removed ${ok}/${results.length} from KB「${meta.name}」.`);
      for (const r of results) {
        const label = r.note_id ? `${r.note_id} (res=${r.resource_id})` : `res=${r.resource_id}`;
        console.log(`  ${r.ok ? "✓" : "✗"} ${label}${r.error ? `  — ${r.error}` : ""}`);
      }
    });

  kb.command("move <fromAlias> <toAlias> <noteIds...>")
    .description("Move notes from one KB topic to another (target directory defaults to target topic's root_dir)")
    .option("--from-directory <dirId>", "source directory id; defaults to source topic root_dir")
    .option("--to-directory <dirId>", "target directory id; defaults to target topic root_dir")
    .option("--by-resource-id", "treat <noteIds> as resource_ids (skip note→resource lookup)")
    .option("--json", "raw JSON output")
    .action(async (fromAlias: string, toAlias: string, ids: string[], opts: { fromDirectory?: string; toDirectory?: string; byResourceId?: boolean; json?: boolean }) => {
      const from = await resolveTopic(fromAlias);
      const to = await resolveTopic(toAlias);
      const toDirId = opts.toDirectory ?? to.topic_directory_id;
      let resourceIds: Array<{ note_id?: string; resource_id: number }>;
      if (opts.byResourceId) {
        resourceIds = ids.map((rid) => ({ resource_id: Number(rid) }));
      } else {
        const fromDirId = opts.fromDirectory ?? from.topic_directory_id;
        const map = await resolveNoteIdsToResourceIds(fromAlias, fromDirId, ids);
        const missing = ids.filter((n) => !map.has(n));
        if (missing.length) {
          console.error(`Note(s) not found in KB「${from.name}」: ${missing.join(", ")}`);
          process.exit(1);
        }
        resourceIds = ids.map((n) => ({ note_id: n, resource_id: map.get(n)! }));
      }
      const results: Array<{ resource_id: number; note_id?: string; ok: boolean; error?: string }> = [];
      for (const r of resourceIds) {
        try {
          await moveResourceBetweenTopics(r.resource_id, from.topic_id, to.topic_id, toDirId);
          results.push({ ...r, ok: true });
        } catch (e) {
          results.push({ ...r, ok: false, error: (e as Error).message });
        }
      }
      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      const ok = results.filter((r) => r.ok).length;
      console.log(`Moved ${ok}/${results.length} from「${from.name}」→「${to.name}」 (dir=${toDirId}).`);
      for (const r of results) {
        const label = r.note_id ? `${r.note_id} (res=${r.resource_id})` : `res=${r.resource_id}`;
        console.log(`  ${r.ok ? "✓" : "✗"} ${label}${r.error ? `  — ${r.error}` : ""}`);
      }
    });

  kb.command("attach <topicIdAlias> <noteIds...>")
    .description("Attach one or more existing notes (by note_id) to a KB topic directory")
    .option("--directory <dirId>", "directory id under the topic; defaults to topic root_dir")
    .option("--json", "raw JSON output")
    .action(async (alias: string, noteIds: string[], opts: { directory?: string; json?: boolean }) => {
      const meta = await resolveTopic(alias);
      const dirId = opts.directory ?? meta.topic_directory_id;
      const res = await attachNotesToTopic(noteIds, meta.topic_id, dirId);
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      console.log(`Attached ${noteIds.length} note(s) to KB「${meta.name}」 (dir=${dirId}).`);
      console.log(`  status: ${res?.c ?? "—"}`);
      for (const id of noteIds) console.log(`  · ${id}`);
    });

  kb.command("link <topicIdAlias> <url>")
    .description("AI-parse a URL into a note inside a KB topic (streaming)")
    .option("-q, --quiet", "suppress progress streaming")
    .option("--json", "output stream summary as JSON")
    .option("-p, --prompt <text>", "custom AI instruction")
    .option("--directory <dirId>", "directory id under the topic; defaults to topic root_dir")
    .action(async (alias: string, url: string, opts: { quiet?: boolean; json?: boolean; prompt?: string; directory?: string }) => {
      const meta = await resolveTopic(alias);
      const onChunk = opts.quiet || opts.json ? undefined : (t: string) => process.stdout.write(t);
      const result = await aiAnalyzeLink(url, onChunk, {
        prompt: opts.prompt,
        topic_id: meta.topic_id,
        topic_directory_id: opts.directory ?? meta.topic_directory_id,
      });
      if (!opts.quiet && !opts.json) process.stdout.write("\n\n");
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("─".repeat(40));
      console.log(`topic:      ${meta.name} (${alias})`);
      console.log(`note_id:    ${result.note_id ?? "—"}`);
      console.log(`link_title: ${result.link_title ?? "—"}`);
      if (result.title) console.log(`title:      ${result.title}`);
      if (result.tags.length) console.log(`tags:       ${result.tags.join(", ")}`);
      console.log(`length:     ${result.content.length} chars`);
    });
}
