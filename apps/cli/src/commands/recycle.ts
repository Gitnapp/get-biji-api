import { Command } from "commander";
import { listRecycledNotes, recycleOpBatch, recycleClear } from "@biji/client";

interface RecycledNote {
  note_id?: string;
  prime_id?: string;
  title?: string;
  content?: string;
  update_time?: string;
  delete_time?: string;
}

function snippet(s: string | undefined, max = 80): string {
  if (!s) return "";
  const flat = s.replace(/<\/?hl>/g, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
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
      const res = (await listRecycledNotes(Number(opts.page), Number(opts.limit))) as {
        c?: { list?: RecycledNote[]; total_items?: number };
      };
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
        console.log(`  ${n.note_id || ""}  ${n.prime_id ? `[${n.prime_id}]  ` : ""}${n.delete_time || n.update_time || ""}`);
        const body = snippet(n.content);
        if (body) console.log(`  ${body}`);
        console.log("");
      }
    });

  recycle
    .command("restore <ids...>")
    .description("Restore note(s) from recycle bin by note_id")
    .action(async (ids: string[]) => {
      const res = await recycleOpBatch(ids, "restore");
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
      const res = await recycleOpBatch(ids, "delete");
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
