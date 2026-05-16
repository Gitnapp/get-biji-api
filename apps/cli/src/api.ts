import { createHash, randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  LEGACY_API,
  NOTES_API,
  request,
  requestSSE,
  type SseResult,
  aiAnalyzeLocalAudio as sdkAiAnalyzeLocalAudio,
  aiAnalyzeLocalVideo as sdkAiAnalyzeLocalVideo,
  getLocalAudioUploadToken as sdkGetLocalAudioUploadToken,
  getLocalVideoUploadToken as sdkGetLocalVideoUploadToken,
  createExportTask as sdkCreateExportTask,
  importNotesToTopic as sdkImportNotesToTopic,
  listKbManagedTopics as sdkListKbManagedTopics,
  listKbTopicResources as sdkListKbTopicResources,
  moveResourceToTopic as sdkMoveResourceToTopic,
  removeResourceFromTopic as sdkRemoveResourceFromTopic,
  uploadMediaToOss as sdkUploadMediaToOss,
  waitForExportTask as sdkWaitForExportTask,
  type ExportFormat,
  type ExportTask,
  type LocalMediaKind,
  type LocalMediaTokenResponse,
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

export interface AiAnalyzeLinkOptions {
  /** Custom instruction passed through as the `content` field. */
  prompt?: string;
  /** Drop into a KB topic — numeric id in string form. */
  topic_id?: string;
  /** Directory id under the topic; pass the topic's `root_dir.id` for the root level. */
  topic_directory_id?: string;
}

export async function aiAnalyzeLink(
  url: string,
  onChunk?: (text: string) => void,
  options: AiAnalyzeLinkOptions = {},
): Promise<SseLinkResult> {
  const body: Record<string, unknown> = {
    attachments: [{ size: 100, type: "link", url }],
    content: options.prompt ?? "",
    entry_type: "ai",
    note_type: "link",
    source: "web",
    client_note_id: randomUUID(),
  };
  if (options.topic_id) body.topic_id = options.topic_id;
  if (options.topic_directory_id) body.topic_directory_id = options.topic_directory_id;
  const apiPath = options.topic_id ? "/voicenotes/web/topics/notes/stream" : "/voicenotes/web/notes/stream";
  const sse: SseResult = await requestSSE(LEGACY_API, apiPath, body, { onChunk });
  return {
    note_id: sse.noteInfo?.note_id,
    link_title: sse.noteInfo?.link_title,
    title: sse.noteInfo?.title,
    content: sse.content,
    tags: sse.noteInfo?.tags ?? [],
    note_data: sse.noteInfo?.noteData,
  };
}

// ──────────────────── Knowledge Base ────────────────────

export interface KbTopic {
  id: number;
  id_alias: string;
  name: string;
  description: string;
  scope: string;
  root_dir?: { id: number; name: string };
  last_update_time_desc?: string;
  extend_data?: { resource_count?: number; stats_info?: string };
}

export async function listKbTopics(page = 1, size = 50) {
  return sdkListKbManagedTopics(page, size) as Promise<BijiResp<{ count?: number; has_more?: boolean; list?: KbTopic[] }>>;
}

export async function listKbResources(topicIdAlias: string, directoryId: number | string, opts: { page?: number } = {}) {
  return sdkListKbTopicResources(topicIdAlias, directoryId, opts) as Promise<BijiResp<unknown>>;
}

export interface AddNoteToTopicInput {
  topic_id: string;
  topic_directory_id?: string;
  content: string;
  title?: string;
}

export async function attachNotesToTopic(noteIds: string[], topicId: string | number, directoryId: string | number) {
  return sdkImportNotesToTopic(noteIds, topicId, directoryId) as Promise<BijiResp<string>>;
}

/**
 * Map note_ids → resource_ids inside a topic. Resource IDs are the per-topic
 * binding ids that {@link removeResourceFromTopic}/{@link moveResourceToTopic}
 * require; users normally only know note_ids.
 */
export async function resolveNoteIdsToResourceIds(
  topicIdAlias: string,
  directoryId: number | string,
  noteIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const want = new Set(noteIds);
  let page = 1;
  while (want.size > 0) {
    const res = await sdkListKbTopicResources(topicIdAlias, directoryId, { page });
    const data = (res as { c?: { resources?: Array<{ id: number; resource_note_meta_data?: { id?: string } }>; has_next?: number } }).c;
    const items = data?.resources ?? [];
    for (const r of items) {
      const nid = r.resource_note_meta_data?.id;
      if (nid && want.has(nid)) {
        map.set(nid, r.id);
        want.delete(nid);
      }
    }
    if (!data?.has_next || items.length === 0) break;
    page += 1;
  }
  return map;
}

export async function removeResourceFromKb(resourceId: number | string, topicId: number | string) {
  return sdkRemoveResourceFromTopic(resourceId, topicId) as Promise<BijiResp<unknown>>;
}

export async function moveResourceBetweenTopics(
  resourceId: number | string,
  fromTopicId: number | string,
  targetTopicId: number | string,
  targetDirectoryId: number | string,
) {
  return sdkMoveResourceToTopic(resourceId, fromTopicId, targetTopicId, targetDirectoryId) as Promise<BijiResp<unknown>>;
}

// ──────────────────── Export ────────────────────

export async function exportNotes(noteIds: string[], type: ExportFormat): Promise<ExportTask> {
  const res = await sdkCreateExportTask(noteIds, type);
  const task = res.c;
  if (!task?.id) throw new Error(`failed to create export task: ${JSON.stringify(res).slice(0, 300)}`);
  return task;
}

export async function waitExportTask(taskId: string, opts: { pollIntervalMs?: number; timeoutMs?: number } = {}): Promise<ExportTask> {
  return sdkWaitForExportTask(taskId, opts);
}

export async function addNoteToTopic(input: AddNoteToTopicInput) {
  const body: Record<string, unknown> = {
    title: input.title ?? "",
    content: input.content,
    json_content: markdownToTipTap(input.content),
    entry_type: "manual",
    note_type: "plain_text",
    source: "web",
    topic_id: input.topic_id,
  };
  if (input.topic_directory_id) body.topic_directory_id = input.topic_directory_id;
  return request<BijiResp<NoteSummary>>(LEGACY_API, "/voicenotes/web/topics/notes", { method: "POST", body });
}

// ──────────────────── Local Media Upload ────────────────────

const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".opus", ".webm"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

export interface UploadLocalMediaOptions {
  /** Force the media kind. Auto-detected from file extension otherwise. */
  kind?: LocalMediaKind;
  /** Override duration in milliseconds. If omitted, defaults to 0 and biji will probe it server-side. */
  duration_ms?: number;
  prompt?: string;
  topic_id?: string;
  topic_directory_id?: string;
  prompt_template_id?: string;
  onChunk?: (text: string) => void;
}

export interface UploadLocalMediaResult {
  file_id: string;
  note_id?: string;
  title?: string;
  content: string;
  oss_url: string;
}

export async function uploadLocalMedia(filePath: string, opts: UploadLocalMediaOptions = {}): Promise<UploadLocalMediaResult> {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`);
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const baseName = path.basename(abs);
  const kind: LocalMediaKind =
    opts.kind ?? (VIDEO_EXT.has(ext) ? "video" : AUDIO_EXT.has(ext) ? "audio" : "audio");
  const md5 = createHash("md5").update(buf).digest("base64");
  const type = ext.startsWith(".") ? ext.slice(1) : ext || (kind === "video" ? "mp4" : "mp3");

  const tokenReq = {
    duration_ms: opts.duration_ms ?? 0,
    local_name: baseName,
    md5,
    size_byte: buf.byteLength,
    type,
  };

  const tokenResp =
    kind === "video"
      ? await sdkGetLocalVideoUploadToken(tokenReq)
      : await sdkGetLocalAudioUploadToken(tokenReq);
  const token: LocalMediaTokenResponse | undefined = (tokenResp as { c?: LocalMediaTokenResponse }).c;
  if (!token?.token_info) {
    throw new Error(`failed to obtain upload token: ${JSON.stringify(tokenResp).slice(0, 300)}`);
  }

  if (!token.is_uploaded) {
    await sdkUploadMediaToOss(token.token_info, buf);
  }

  const sse =
    kind === "video"
      ? await sdkAiAnalyzeLocalVideo(token, opts.duration_ms ?? 0, {
          prompt: opts.prompt,
          topic_id: opts.topic_id,
          topic_directory_id: opts.topic_directory_id,
          prompt_template_id: opts.prompt_template_id,
          onChunk: opts.onChunk,
        })
      : await sdkAiAnalyzeLocalAudio(token, opts.duration_ms ?? 0, {
          prompt: opts.prompt,
          topic_id: opts.topic_id,
          topic_directory_id: opts.topic_directory_id,
          prompt_template_id: opts.prompt_template_id,
          onChunk: opts.onChunk,
        });

  return {
    file_id: token.file_id,
    note_id: sse.noteInfo?.note_id,
    title: sse.noteInfo?.title || sse.noteInfo?.link_title,
    content: sse.content,
    oss_url: token.token_info.get_url,
  };
}
