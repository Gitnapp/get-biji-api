import { Command } from "commander";
import { getNote } from "../api.js";

export function registerGetCommand(program: Command): void {
  program
    .command("get <id>")
    .description("Print a note by note_id (numeric) or prime_id (slug)")
    .option("--json", "output raw API response")
    .option("--content-only", "print only the markdown content")
    .action(async (id: string, opts: { json?: boolean; contentOnly?: boolean }) => {
      const res = await getNote(id);
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      const cRaw = res?.c as Record<string, unknown> | undefined;
      const note = (cRaw?.data as Record<string, unknown> | undefined) ?? cRaw;
      if (!note || !note.note_id) {
        console.error("Note not found.");
        process.exit(1);
      }
      if (opts.contentOnly) {
        process.stdout.write((note.content as string) ?? "");
        return;
      }
      console.log(`# ${(note.title as string) || "(untitled)"}`);
      console.log(`note_id:    ${note.note_id}`);
      console.log(`prime_id:   ${note.prime_id}`);
      const tags = (note.tags as Array<{ name: string }> | undefined)?.map((t) => t.name).join(", ");
      if (tags) console.log(`tags:       ${tags}`);
      console.log(`updated:    ${note.update_time ?? note.edit_time ?? ""}`);
      console.log("─".repeat(40));
      console.log((note.content as string) ?? "");
    });
}
