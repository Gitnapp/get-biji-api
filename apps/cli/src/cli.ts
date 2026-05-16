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

const program = new Command();
program
  .name("biji")
  .description("CLI for Get笔记 (biji.com): write / link / search / edit")
  .version("0.1.0");

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

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
