#!/usr/bin/env node
import { Command } from "commander";
import { loadAuth } from "./auth.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerWriteCommand } from "./commands/write.js";
import { registerLinkCommand } from "./commands/link.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerEditCommand } from "./commands/edit.js";
import { registerGetCommand } from "./commands/get.js";
import { registerRmCommand } from "./commands/rm.js";
import { registerChatCommand } from "./commands/chat.js";
import { registerRecycleCommand } from "./commands/recycle.js";
import { registerKbCommand } from "./commands/kb.js";
import { registerUploadCommand } from "./commands/upload.js";
import { registerExportCommand } from "./commands/export.js";
import { registerQueueCommand } from "./commands/queue.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerSetupCommand } from "./commands/setup.js";
import { registerAiCommand, printAiGuide } from "./commands/ai.js";

// `biji --ai` (top-level, no subcommand) short-circuits before commander parses.
// Match only the LEADING token so `--ai` passed as a positional/option value to a
// subcommand (e.g. `biji write --ai`, `biji search --ai`) is left for commander.
if (process.argv.slice(2)[0] === "--ai") {
  printAiGuide();
  process.exit(0);
}

const program = new Command();
program
  .name("biji")
  .description("CLI for Get笔记 (biji.com): write / link / search / edit / queue / mcp setup")
  .version("0.1.0")
  .option("--ai", "print an AI-agent oriented usage guide and exit");

loadAuth();

registerAuthCommands(program);
registerWriteCommand(program);
registerLinkCommand(program);
registerSearchCommand(program);
registerEditCommand(program);
registerGetCommand(program);
registerRmCommand(program);
registerChatCommand(program);
registerRecycleCommand(program);
registerKbCommand(program);
registerUploadCommand(program);
registerExportCommand(program);
registerQueueCommand(program);
registerDoctorCommand(program);
registerSetupCommand(program);
registerAiCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
