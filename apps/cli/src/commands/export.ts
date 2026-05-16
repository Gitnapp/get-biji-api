import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { exportNotes, waitExportTask } from "../api.js";
import { getExportTask, type ExportFormat } from "@biji/client";

const VALID: ExportFormat[] = ["pdf", "docx", "md", "mp3"];

async function downloadToFile(url: string, outDir: string, fallbackName: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download failed: ${resp.status} ${resp.statusText}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, fallbackName);
  fs.writeFileSync(target, buf);
  return target;
}

export function registerExportCommand(program: Command): void {
  program
    .command("export <noteIds...>")
    .description("Export one or more notes to pdf/docx/md/mp3. By default returns the task id only.")
    .option("-t, --type <fmt>", "format: pdf | docx | md | mp3 (mp3 only valid for audio notes)", "pdf")
    .option("--wait", "poll until task finishes, then print the access_url")
    .option("--download <dir>", "download the finished file to <dir> (implies --wait)")
    .option("--timeout <ms>", "wait timeout in ms (default 120000)")
    .option("--json", "output raw task JSON")
    .action(async (noteIds: string[], opts: { type?: string; wait?: boolean; download?: string; timeout?: string; json?: boolean }) => {
      const type = (opts.type ?? "pdf") as ExportFormat;
      if (!VALID.includes(type)) {
        console.error(`--type must be one of ${VALID.join(", ")} (got: ${type})`);
        process.exit(1);
      }
      const task = await exportNotes(noteIds, type);
      const shouldWait = opts.wait || !!opts.download;
      if (!shouldWait) {
        if (opts.json) {
          console.log(JSON.stringify(task, null, 2));
        } else {
          console.log(`Export task created: ${task.id} (${task.type}, status=${task.status})`);
          console.log(`Poll with: biji export-status ${task.id}`);
        }
        return;
      }
      const final = await waitExportTask(task.id, { timeoutMs: opts.timeout ? Number(opts.timeout) : undefined });
      if (final.status !== "success") {
        console.error(`Export failed: status=${final.status}, finished=${final.finished}`);
        process.exit(1);
      }
      if (opts.download) {
        const filePath = await downloadToFile(final.access_url, opts.download, final.filename || `${task.id}.${type}`);
        if (opts.json) {
          console.log(JSON.stringify({ ...final, downloaded_to: filePath }, null, 2));
        } else {
          console.log(`Saved to: ${filePath}`);
        }
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(final, null, 2));
      } else {
        console.log(`Done. ${final.filename}`);
        console.log(final.access_url);
      }
    });

  program
    .command("export-status <taskId>")
    .description("Check an export task's status (returns access_url once finished)")
    .option("--json", "raw JSON output")
    .action(async (taskId: string, opts: { json?: boolean }) => {
      const resp = await getExportTask(taskId);
      const task = resp.c;
      if (!task) {
        console.error(`Task ${taskId} not found`);
        process.exit(1);
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(task, null, 2));
        return;
      }
      console.log(`Task ${task.id} · ${task.type} · ${task.status} · finished=${task.finished}`);
      if (task.access_url) console.log(`URL: ${task.access_url}`);
    });
}
