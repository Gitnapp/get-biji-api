import { Command } from "commander";
import { listRecycledNotes, recycleOpBatch, recycleClear } from "@biji/client";

interface RecycledNote {
  note_id?: string;
  prime_id?: string;
  title?: string;
  content?: string;
  update_time?: string;
  delete_time?: string;
  updated_at?: string;
  created_at?: string;
}

function snippet(s: string | undefined, max = 80): string {
  if (!s) return "";
  const flat = s.replace(/<\/?hl>/g, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

async function fetchRecyclePage(page: number, limit: number) {
  let sinceId = "";
  let res: { c?: { list?: RecycledNote[]; total_items?: number; has_more?: boolean } } = {};
  for (let i = 0; i < page; i++) {
    res = (await listRecycledNotes({ limit, sinceId, range: 1 })) as typeof res;
    const items = res.c?.list ?? [];
    sinceId = items[items.length - 1]?.note_id ?? "";
    if (!sinceId) break;
  }
  return res;
}

export function registerRecycleCommand(program: Command): void {
  const recycle = program
    .command("recycle")
    .description("Manage notes in the recycle bin (restore / clear)");

  recycle
    .command("list")
    .description("List notes in the recycle bin")
    .option("-n, --limit <num>", "page size", "20")
    .option("-p, --page <num>", "page number", "1")
    .option("--json", "output raw API response")
    .action(async (opts: { limit: string; page: string; json?: boolean }) => {
      const limit = Number(opts.limit);
      const page = Number(opts.page);
      const res = await fetchRecyclePage(page, limit);
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      const items = res?.c?.list ?? [];
      const total = res?.c?.total_items ?? items.length;
      if (!items.length) {
        console.log("Recycle bin is empty.");
        return;
      }
      console.log(`Recycle bin: ${total} total (showing ${items.length}):\n`);
      for (const n of items) {
        console.log(`• ${n.title || "(untitled)"}`);
        console.log(`  ${n.note_id || ""}  ${n.prime_id ? `[${n.prime_id}]  ` : ""}${n.delete_time || n.update_time || n.updated_at || n.created_at || ""}`);
        const body = snippet(n.content);
        if (body) console.log(`  ${body}`);
        console.log("");
      }
    });

  recycle
    .command("restore <ids...>")
    .description("Restore note(s) from recycle bin by prime_id")
    .action(async (ids: string[]) => {
      const res = await recycleOpBatch(ids, "resume");
      const code = (res as { h?: { c?: number } })?.h?.c ?? -1;
      if (code === 0) {
        for (const id of ids) console.log(`✓ ${id} restored`);
      } else {
        console.error(`✗ restore failed: ${JSON.stringify(res)}`);
        process.exit(1);
      }
    });

  recycle
    .command("delete <ids...>")
    .description("Permanently delete note(s) from recycle bin (irreversible)")
    .option("-y, --yes", "skip confirmation prompt")
    .action(async (ids: string[], opts: { yes?: boolean }) => {
      if (!opts.yes) {
        console.error(`This permanently deletes ${ids.length} note(s). Re-run with --yes to confirm.`);
        process.exit(1);
      }
      const res = await recycleOpBatch(ids, "del");
      const code = (res as { h?: { c?: number } })?.h?.c ?? -1;
      if (code === 0) {
        for (const id of ids) console.log(`✓ ${id} permanently deleted`);
      } else {
        console.error(`✗ delete failed: ${JSON.stringify(res)}`);
        process.exit(1);
      }
    });

  recycle
    .command("clear")
    .description("Permanently empty the entire recycle bin (irreversible)")
    .option("-y, --yes", "skip confirmation prompt")
    .action(async (opts: { yes?: boolean }) => {
      if (!opts.yes) {
        console.error("This permanently empties the recycle bin. Re-run with --yes to confirm.");
        process.exit(1);
      }
      const res = await recycleClear();
      const code = (res as { h?: { c?: number } })?.h?.c ?? -1;
      if (code === 0) console.log("✓ recycle bin cleared");
      else {
        console.error(`✗ clear failed: ${JSON.stringify(res)}`);
        process.exit(1);
      }
    });
}
