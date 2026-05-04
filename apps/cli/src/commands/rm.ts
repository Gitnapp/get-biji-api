import { Command } from "commander";
import { deleteNote } from "../api.js";

async function deleteOne(id: string, json: boolean): Promise<boolean> {
  const res = await deleteNote(id);
  const ok = res?.h?.c === 0;
  if (json) console.log(JSON.stringify(res));
  else if (ok) console.log(`✓ ${id} → recycle bin`);
  else console.error(`✗ ${id} failed: ${JSON.stringify(res).slice(0, 200)}`);
  return !!ok;
}

export function registerRmCommand(program: Command): void {
  const action = async (ids: string[], opts: { json?: boolean }) => {
    if (!ids.length) {
      console.error("No id given. Pass one or more note_id / prime_id.");
      process.exit(1);
    }
    let failed = 0;
    for (const id of ids) {
      const ok = await deleteOne(id, !!opts.json);
      if (!ok) failed++;
    }
    if (failed > 0) process.exit(1);
  };

  program
    .command("rm <ids...>")
    .alias("delete")
    .description("Move one or more notes to the recycle bin (restorable from web UI)")
    .option("--json", "output raw API response per id")
    .action(action);
}
