import { Command } from "commander";

/**
 * Compact, agent-oriented usage guide. Printed by `biji ai` and by the top-level
 * `biji --ai` flag so an AI assistant driving the CLI can self-orient in one read.
 */
const AI_GUIDE = `# biji — AI agent guide

Get笔记 (biji.com) note-taking, driven from the terminal or as an MCP server.
Auth is JWT + refresh_token (~90d) stored at ~/.config/get-biji/auth.json; the JWT
auto-refreshes before each call. Most commands accept --json for machine output.

## Setup (once)
  biji auth login            # paste browser-exported auth JSON (see the printed tutorial)
  biji auth status           # check token validity
  biji doctor                # diagnose auth / build / queue / MCP-client config
  biji doctor --json         # machine-readable; exit 1 if any check fails

## Notes
  biji write "<text>"                 # create a note (markdown → TipTap)
  biji write -t "<title>" -f <file>   # from a file; or pipe via stdin
  biji search "<query>" -n 15         # full-text search
  biji get <prime_id>                 # fetch one note
  biji edit <id>                      # open in $EDITOR
  biji rm <prime_id>                  # delete (goes to recycle bin)
  biji link <url> -p "<prompt>"       # AI-summarize a URL into a note (streaming)

## Knowledge base (topics)
  biji kb list                        # list topics with id_alias + counts
  biji kb resources <alias>           # list resources in a topic
  biji kb add <alias> "<text>"        # new note straight into a KB topic
  biji kb attach|remove|move ...      # manage note↔topic membership

## Media + export
  biji upload <file.mp3|mp4>          # ASR + structured note (audio/video auto-detected)
  biji export <noteId...> -t md --download <dir>   # pdf|docx|md|mp3 (async task)

## Yoda chat (RAG over your notes)
  biji chat "<question>"              # oneshot; --web / --dedao to widen scope
  biji chat                           # interactive REPL

## Background queue (bulk, non-blocking — worker auto-spawns, dedupes)
  biji queue add -f urls.txt --topic <alias> --batch <name>
  biji queue upload ./recordings/*.mp3
  biji queue status | list | logs -f | retry --all-failed

## MCP server
Install into an AI client automatically:
  biji setup add claude-code | claude-desktop | cursor | windsurf | cline | gemini
  biji setup list                     # show config paths + current status
  biji setup add --file <config.json> # any other client (prints the snippet too)
Run directly: npx -y biji-mcp   (or: node apps/mcp/dist/index.js)
The MCP server exposes ~81 tools (notes / tags / topics / KB / Yoda chat / AI writing
/ media upload / export / Canvas) plus 6 queue tools sharing the CLI's daemon.

Tip: append --json to most commands for structured output you can parse.`;

export function printAiGuide(): void {
  console.log(AI_GUIDE);
}

export function registerAiCommand(program: Command): void {
  program
    .command("ai")
    .description("Print an AI-agent oriented usage guide (same as `biji --ai`)")
    .action(() => printAiGuide());
}
