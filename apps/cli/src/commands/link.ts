import { Command } from "commander";
import { aiAnalyzeLink } from "../api.js";

export function registerLinkCommand(program: Command): void {
  program
    .command("link <url>")
    .description("AI-analyze a URL into a structured note (streaming)")
    .option("-q, --quiet", "suppress progress streaming, only print summary")
    .option("--json", "output raw stream summary as JSON")
    .action(async (url: string, opts: { quiet?: boolean; json?: boolean }) => {
      const onChunk = opts.quiet || opts.json
        ? undefined
        : (text: string) => process.stdout.write(text);
      const result = await aiAnalyzeLink(url, onChunk);
      if (!opts.quiet && !opts.json) process.stdout.write("\n\n");
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("─".repeat(40));
      console.log(`note_id:    ${result.note_id ?? "—"}`);
      console.log(`link_title: ${result.link_title ?? "—"}`);
      if (result.title) console.log(`title:      ${result.title}`);
      if (result.tags.length) console.log(`tags:       ${result.tags.join(", ")}`);
      console.log(`length:     ${result.content.length} chars`);
    });
}
