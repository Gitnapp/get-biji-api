import { Command } from "commander";
import { searchNotes } from "../api.js";

function snippet(s: string | undefined, max = 100): string {
  if (!s) return "";
  const flat = s.replace(/<\/?hl>/g, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

function stripHl(s: string | undefined): string {
  return (s ?? "").replace(/<\/?hl>/g, "");
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("Search your notes")
    .option("-n, --limit <num>", "max results", "10")
    .option("-p, --page <num>", "page number", "1")
    .option("--json", "output raw API response")
    .action(async (query: string, opts: { limit: string; page: string; json?: boolean }) => {
      const res = await searchNotes(query, Number(opts.page), Number(opts.limit));
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      const items = ((res?.c as { items?: Array<Record<string, unknown>> } | undefined)?.items) ?? [];
      const total = (res as unknown as { h?: { t?: number } })?.h?.t ?? items.length;
      if (!items.length) {
        console.log(`No results for "${query}".`);
        return;
      }
      console.log(`Found ${total} (showing ${items.length}):\n`);
      for (const n of items) {
        const title = stripHl(n.title as string) || "(untitled)";
        const id = n.note_id as string;
        const prime = n.prime_id as string;
        const upd = (n.update_time as string) || (n.edit_time as string) || "";
        const body = snippet(n.content as string | undefined);
        console.log(`• ${title}`);
        console.log(`  ${id}  ${prime ? `[${prime}]  ` : ""}${upd}`);
        if (body) console.log(`  ${body}`);
        console.log("");
      }
    });
}
