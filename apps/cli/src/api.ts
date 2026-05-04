import { randomUUID } from "crypto";
import {
  LEGACY_API,
  NOTES_API,
  request,
  requestSSE,
  type SseResult,
} from "@biji/client";
import { markdownToTipTap } from "./markdown.js";

export { markdownToTipTap };

export interface BijiResp<T = unknown> {
  h?: { c?: number; e?: string; s?: number; t?: number; apm?: string };
  c?: T;
  msg?: string;
  status_code?: number;
}

export interface NoteSummary {
  note_id: string;
  prime_id: string;
  title: string;
  content?: string;
  tags?: Array<{ id: string; name: string; type?: string }>;
  attachments?: unknown[];
  json_content?: string;
  note_type?: string;
  entry_type?: string;
  source?: string;
  version?: number;
  create_time?: number;
  update_time?: number;
  [k: string]: unknown;
}

export async function getUserInfo() {
  return request<BijiResp<{ data?: { uid?: number; nickname?: string } }>>(
    NOTES_API,
    "/voicenotes/web/user/info",
  );
}

export async function searchNotes(query: string, page = 1, pageSize = 20) {
  return request<BijiResp<{ data?: { notes?: NoteSummary[]; total?: number } }>>(
    NOTES_API,
    "/voicenotes/web/notes/search",
    { params: { query, page, page_size: pageSize } },
  );
}

export async function getNote(idOrPrime: string) {
  return request<BijiResp<{ data?: NoteSummary }>>(
    LEGACY_API,
    `/voicenotes/web/notes/${idOrPrime}`,
  );
}

export interface CreateNoteInput {
  content: string;
  title?: string;
  topic_id?: string;
}

export async function createNote(input: CreateNoteInput) {
  const body: Record<string, unknown> = {
    title: input.title ?? "",
    content: input.content,
    json_content: markdownToTipTap(input.content),
    entry_type: "manual",
    note_type: "plain_text",
    source: "web",
    tags: [],
  };
  if (input.topic_id) body.topic_id = input.topic_id;
  const path = input.topic_id ? "/voicenotes/web/topics/notes" : "/voicenotes/web/notes";
  return request<BijiResp<NoteSummary>>(LEGACY_API, path, { method: "POST", body });
}

export async function updateNote(primeId: string, full: NoteSummary) {
  return request<BijiResp<{ data?: NoteSummary }>>(
    LEGACY_API,
    `/voicenotes/web/notes/${primeId}`,
    { method: "PUT", body: full },
  );
}

export async function deleteNote(primeId: string) {
  return request<BijiResp<{ note_id?: string }>>(
    LEGACY_API,
    `/voicenotes/web/notes/${primeId}`,
    { method: "DELETE" },
  );
}

export interface SseLinkResult {
  note_id?: string;
  link_title?: string;
  title?: string;
  content: string;
  tags: string[];
  note_data?: Record<string, unknown>;
}

export async function aiAnalyzeLink(
  url: string,
  onChunk?: (text: string) => void,
): Promise<SseLinkResult> {
  const body = {
    attachments: [{ size: 100, type: "link", title: "", url }],
    content: "",
    entry_type: "ai",
    note_type: "link",
    source: "web",
    prompt_template_id: "",
    client_note_id: randomUUID(),
  };
  const sse: SseResult = await requestSSE(LEGACY_API, "/voicenotes/web/notes/stream", body, { onChunk });
  return {
    note_id: sse.noteInfo?.note_id,
    link_title: sse.noteInfo?.link_title,
    title: sse.noteInfo?.title,
    content: sse.content,
    tags: sse.noteInfo?.tags ?? [],
    note_data: sse.noteInfo?.noteData,
  };
}
