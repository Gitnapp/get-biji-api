import { Command } from "commander";
import * as readline from "readline";
import { authStatus, setAuth, getAuth, AuthInfo } from "../auth.js";
import { getUserInfo } from "../api.js";

const SNIPPET = `copy(JSON.stringify({
  token: localStorage.getItem("token"),
  token_expire_at: Number(localStorage.getItem("token_expire_at")),
  refresh_token: localStorage.getItem("refresh_token"),
  refresh_token_expire_at: Number(localStorage.getItem("refresh_token_expire_at"))
}))`;

function printTutorial(): void {
  const indent = (s: string, n = 6) => s.split("\n").map((l) => " ".repeat(n) + l).join("\n");
  console.log(`
🔐  Login to Get笔记 (biji.com)

  Step 1.  Sign in to biji.com in your browser:
             https://www.biji.com/note
           (Make sure you reach the notes app, not the marketing page.)

  Step 2.  Press F12 → Console tab, paste this snippet and hit Enter:

${indent(SNIPPET)}

           The copy(...) call puts your auth JSON on the clipboard.

  Step 3.  Paste the JSON. Pick whichever is fastest for your OS:

             macOS:    pbpaste                          | biji auth login
             Linux:    xclip -selection clipboard -o    | biji auth login
             WSL:      powershell.exe Get-Clipboard     | biji auth login
             Any OS:   biji auth login --json '<paste>'
             Or:       just paste below ↓
`);
}

async function readPipedStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

async function promptForJson(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("Paste auth JSON here: ", (line) => {
      rl.close();
      resolve(line);
    });
  });
}

function parseAuthJson(raw: string): AuthInfo | null {
  try {
    const j = JSON.parse(raw.trim()) as Partial<AuthInfo>;
    if (!j.token || !j.refresh_token) return null;
    return {
      token: j.token,
      token_expire_at: Number(j.token_expire_at) || 0,
      refresh_token: j.refresh_token,
      refresh_token_expire_at: Number(j.refresh_token_expire_at) || 0,
    };
  } catch {
    return null;
  }
}

async function applyAuth(auth: AuthInfo): Promise<void> {
  setAuth(auth);
  const now = Math.floor(Date.now() / 1000);
  const jwtMin = Math.floor((auth.token_expire_at - now) / 60);
  const refDay = Math.floor((auth.refresh_token_expire_at - now) / 86400);
  try {
    const info = await getUserInfo();
    const uid = info?.c && (info.c as { data?: { uid?: number } }).data?.uid;
    console.log(`✓ Auth saved. uid=${uid ?? "unknown"}, JWT ${jwtMin}min, refresh ${refDay}d.`);
  } catch (err) {
    console.error(`Auth saved but verification failed: ${(err as Error).message}`);
    console.error(`(JWT ${jwtMin}min, refresh ${refDay}d — try \`biji auth status\` to check.)`);
  }
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage authentication");

  auth
    .command("status")
    .description("Show current auth status")
    .action(() => console.log(authStatus()));

  auth
    .command("login [json]")
    .alias("set")
    .description("Log in by pasting auth JSON. Prints a guided tutorial when no input given.")
    .option("--json <json>", "auth JSON string (alternative to positional/stdin)")
    .action(async (positional: string | undefined, opts: { json?: string }) => {
      const piped = await readPipedStdin();
      let raw = positional || opts.json || piped;

      if (!raw.trim()) {
        printTutorial();
        raw = await promptForJson();
      }

      const parsed = parseAuthJson(raw);
      if (!parsed) {
        console.error("\n✗ Could not parse auth JSON. Expected fields: token, token_expire_at, refresh_token, refresh_token_expire_at.");
        process.exit(1);
      }
      await applyAuth(parsed);
    });

  auth
    .command("show")
    .description("Print raw auth file (for debugging)")
    .action(() => console.log(JSON.stringify(getAuth(), null, 2)));
}
