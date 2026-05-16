import { Command } from "commander";
import { listKbTopics, uploadLocalMedia, type KbTopic } from "../api.js";
import type { LocalMediaKind } from "@biji/client";

interface UploadOpts {
  topic?: string;
  directory?: string;
  prompt?: string;
  kind?: LocalMediaKind;
  duration?: string;
  quiet?: boolean;
  json?: boolean;
}

async function resolveTopic(alias: string | undefined): Promise<{ topic_id?: string; topic_directory_id?: string; name?: string }> {
  if (!alias) return {};
  const res = await listKbTopics(1, 50);
  const list = res?.c?.list as KbTopic[] | undefined;
  const t = list?.find((x) => x.id_alias === alias || String(x.id) === alias);
  if (!t) {
    const known = list?.map((x) => `${x.id_alias} (${x.name})`).join(", ") ?? "(none)";
    throw new Error(`KB topic not found: ${alias}\nAvailable: ${known}`);
  }
  return { topic_id: String(t.id), topic_directory_id: String(t.root_dir?.id ?? ""), name: t.name };
}

export function registerUploadCommand(program: Command): void {
  program
    .command("upload <file>")
    .description("Upload an audio/video file. Runs OSS PUT + AI stream (ASR + structured note).")
    .option("--topic <topicIdAlias>", "drop the resulting note into a KB topic")
    .option("--directory <dirId>", "directory id; defaults to the topic's root_dir")
    .option("-p, --prompt <text>", "custom AI instruction")
    .option("-k, --kind <audio|video>", "force media kind (auto-detected from extension)")
    .option("--duration <ms>", "duration in milliseconds (server probes if omitted)")
    .option("-q, --quiet", "suppress streaming chunks")
    .option("--json", "output result as JSON")
    .action(async (file: string, opts: UploadOpts) => {
      if (opts.kind && opts.kind !== "audio" && opts.kind !== "video") {
        console.error(`--kind must be 'audio' or 'video', got: ${opts.kind}`);
        process.exit(1);
      }
      const meta = await resolveTopic(opts.topic);
      const onChunk = opts.quiet || opts.json ? undefined : (t: string) => process.stdout.write(t);
      const result = await uploadLocalMedia(file, {
        kind: opts.kind,
        duration_ms: opts.duration ? Number(opts.duration) : undefined,
        prompt: opts.prompt,
        topic_id: meta.topic_id,
        topic_directory_id: opts.directory ?? meta.topic_directory_id,
        onChunk,
      });
      if (!opts.quiet && !opts.json) process.stdout.write("\n\n");
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("─".repeat(40));
      if (meta.name) console.log(`topic:    ${meta.name} (${opts.topic})`);
      console.log(`file_id:  ${result.file_id}`);
      console.log(`note_id:  ${result.note_id ?? "—"}`);
      if (result.title) console.log(`title:    ${result.title}`);
      console.log(`length:   ${result.content.length} chars`);
    });
}
