import { createHash, randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  aiAnalyzeLink as sdkAiAnalyzeLink,
  aiAnalyzeLocalAudio as sdkAiAnalyzeLocalAudio,
  aiAnalyzeLocalVideo as sdkAiAnalyzeLocalVideo,
  getLocalAudioUploadToken as sdkGetLocalAudioUploadToken,
  getLocalVideoUploadToken as sdkGetLocalVideoUploadToken,
  listKbManagedTopics,
  uploadMediaToOss as sdkUploadMediaToOss,
  type LocalMediaKind,
  type LocalMediaTokenResponse,
} from "@biji/client";
import type { JobResult, LinkPayload, UploadPayload } from "./types.js";

interface KbTopicRow {
  id: number | string;
  id_alias: string;
  root_dir?: { id: number | string };
}

const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".opus", ".webm"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

let topicCache: Map<string, { topic_id: string; topic_directory_id: string }> | null = null;

/**
 * Resolve a KB topic alias (or numeric id-as-string) to the ids needed by the
 * note-creation endpoints. Cached for the lifetime of the worker process to
 * avoid hitting the topic-list endpoint on every job.
 */
export async function resolveTopicAlias(alias?: string): Promise<{ topic_id?: string; topic_directory_id?: string }> {
  if (!alias) return {};
  if (!topicCache) {
    const res = (await listKbManagedTopics(1, 50)) as { c?: { list?: KbTopicRow[] } };
    const list = res?.c?.list ?? [];
    topicCache = new Map();
    for (const t of list) {
      const meta = { topic_id: String(t.id), topic_directory_id: String(t.root_dir?.id ?? "") };
      topicCache.set(t.id_alias, meta);
      topicCache.set(String(t.id), meta);
    }
  }
  const hit = topicCache.get(alias);
  if (!hit) throw new Error(`KB topic alias not found: ${alias}`);
  return hit;
}

/** Reset the topic cache. Useful if topics have been reorganized mid-flight. */
export function resetTopicCache(): void {
  topicCache = null;
}

export async function runLinkJob(payload: LinkPayload): Promise<JobResult> {
  const meta = await resolveTopicAlias(payload.topic_alias);
  const sse = await sdkAiAnalyzeLink(payload.url, {
    prompt: payload.prompt,
    topic_id: meta.topic_id,
    topic_directory_id: meta.topic_directory_id,
  });
  return {
    note_id: sse.noteInfo?.note_id,
    title: sse.noteInfo?.title,
    link_title: sse.noteInfo?.link_title,
    content_length: sse.content.length,
  };
}

export async function runUploadJob(payload: UploadPayload): Promise<JobResult> {
  const abs = path.resolve(payload.file);
  if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`);
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const baseName = path.basename(abs);
  const kind: LocalMediaKind =
    payload.kind ?? (VIDEO_EXT.has(ext) ? "video" : AUDIO_EXT.has(ext) ? "audio" : "audio");
  const md5 = createHash("md5").update(buf).digest("base64");
  const type = ext.startsWith(".") ? ext.slice(1) : ext || (kind === "video" ? "mp4" : "mp3");

  const tokenReq = {
    duration_ms: payload.duration_ms ?? 0,
    local_name: baseName,
    md5,
    size_byte: buf.byteLength,
    type,
  };

  const tokenResp = kind === "video"
    ? await sdkGetLocalVideoUploadToken(tokenReq)
    : await sdkGetLocalAudioUploadToken(tokenReq);
  const token = (tokenResp as { c?: LocalMediaTokenResponse }).c;
  if (!token?.token_info) {
    throw new Error(`failed to obtain upload token: ${JSON.stringify(tokenResp).slice(0, 300)}`);
  }

  if (!token.is_uploaded) {
    await sdkUploadMediaToOss(token.token_info, buf);
  }

  const meta = await resolveTopicAlias(payload.topic_alias);
  const sseOpts = {
    prompt: payload.prompt,
    topic_id: meta.topic_id,
    topic_directory_id: meta.topic_directory_id,
    client_note_id: randomUUID(),
  };

  const sse = kind === "video"
    ? await sdkAiAnalyzeLocalVideo(token, payload.duration_ms ?? 0, sseOpts)
    : await sdkAiAnalyzeLocalAudio(token, payload.duration_ms ?? 0, sseOpts);

  return {
    note_id: sse.noteInfo?.note_id,
    title: sse.noteInfo?.title || sse.noteInfo?.link_title,
    content_length: sse.content.length,
    oss_url: token.token_info.get_url,
    file_id: token.file_id,
  };
}
