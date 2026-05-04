import { ensureFreshToken, getToken } from "./auth.js";

export const NOTES_API = "https://notes-api.biji.com";
export const LEGACY_API = "https://get-notes.luojilab.com";
export const OPEN_API = "https://knowledge-api.trytalks.com";
export const YODA_API = "https://notes-api.biji.com";

export interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  extraHeaders?: Record<string, string>;
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json;charset=UTF-8",
    "X-Appid": "3",
    ...extra,
  };
  const token = getToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function request<T = unknown>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  await ensureFreshToken();
  const { method = "GET", body, params, extraHeaders } = options;
  let url = `${baseUrl}${path}`;
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }
  const init: RequestInit = { method, headers: buildHeaders(extraHeaders) };
  if (body !== undefined) init.body = JSON.stringify(body);
  const resp = await fetch(url, init);
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`${method} ${url} → ${resp.status} ${resp.statusText}\n${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export interface SseNoteInfo {
  note_id?: string;
  link_title?: string;
  title?: string;
  instruction?: string;
  tags?: string[];
  noteData?: Record<string, unknown>;
}

export interface SseResult {
  content: string;
  events: unknown[];
  noteInfo?: SseNoteInfo;
}

export interface SseOptions {
  /** Called for every content chunk as it arrives — enables real-time streaming UX. */
  onChunk?: (text: string) => void;
}

/**
 * Stream a Server-Sent Events response and aggregate content.
 * Reads the body incrementally so consumers can render content as it arrives.
 */
export async function requestSSE(
  baseUrl: string,
  path: string,
  body: unknown,
  options: SseOptions = {},
): Promise<SseResult> {
  await ensureFreshToken();
  const url = `${baseUrl}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { ...buildHeaders(), Accept: "text/event-stream", Connection: "keep-alive" },
    body: JSON.stringify(body),
  });

  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    return { content: `HTTP ${resp.status}: ${resp.statusText}\n${t.slice(0, 500)}`, events: [] };
  }

  const events: unknown[] = [];
  let content = "";
  let noteId = "";
  let linkTitle = "";
  let instruction = "";
  let title = "";
  const tags: string[] = [];
  let noteData: Record<string, unknown> | undefined;
  let hasBijiFormat = false;

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const handleLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let parsed: {
      msg_type?: number;
      data?: { msg?: string; note_id?: string; link_title?: string; content?: string };
      content?: string;
      text?: string;
      delta?: { content?: string };
    };
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    events.push(parsed);

    if (typeof parsed.msg_type === "number") {
      hasBijiFormat = true;
      const msg = parsed.data?.msg;
      if (parsed.msg_type === -1) {
        if (parsed.data?.note_id) noteId = parsed.data.note_id;
        if (parsed.data?.link_title) linkTitle = parsed.data.link_title;
      } else if (parsed.msg_type === 1 && msg && msg !== "stop") {
        let inner: unknown;
        try {
          inner = JSON.parse(msg);
        } catch {
          inner = undefined;
        }
        if (inner && typeof inner === "object" && !Array.isArray(inner)) {
          const obj = inner as { content?: string; title?: string; tags?: string[]; instruction?: string };
          if (obj.instruction) instruction += obj.instruction;
          if (obj.title) title += obj.title;
          if (obj.content) {
            content += obj.content;
            options.onChunk?.(obj.content);
          }
          if (obj.tags) tags.push(...obj.tags);
        } else {
          content += msg;
          options.onChunk?.(msg);
        }
      } else if (parsed.msg_type === -2 && msg) {
        try {
          noteData = JSON.parse(msg) as Record<string, unknown>;
        } catch {
          // ignore
        }
      }
    } else {
      const piece = parsed.content ?? parsed.text ?? parsed.delta?.content ?? parsed.data?.content;
      if (typeof piece === "string") {
        content += piece;
        options.onChunk?.(piece);
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      handleLine(buf.slice(0, idx).trimEnd());
      buf = buf.slice(idx + 1);
    }
  }
  if (buf.length > 0) handleLine(buf);

  const result: SseResult = { content, events };
  if (hasBijiFormat) {
    result.noteInfo = {
      note_id: noteId || undefined,
      link_title: linkTitle || undefined,
      title: title || undefined,
      instruction: instruction || undefined,
      tags: tags.length > 0 ? tags : undefined,
      noteData,
    };
  }
  return result;
}
