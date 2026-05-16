import { setToken } from "./auth.js";
import {
  LEGACY_API,
  NOTES_API,
  OPEN_API,
  YODA_API,
  request,
  requestSSE,
  type SseOptions,
  type SseResult,
} from "./client.js";

// ──────────────────── Auth ────────────────────

/** Send SMS verification code */
export async function sendSmsCode(phone: string, captcha_token?: string) {
  return request(NOTES_API, "/voicenotes/web/v2/login/smscode/send", {
    method: "POST",
    body: { phone, captcha_token },
  });
}

/** Login with SMS code. On success, the JWT is stored as a token without refresh capability. */
export async function loginWithSms(phone: string, smscode: string) {
  const res = await request<{ data?: { token?: string } }>(NOTES_API, "/voicenotes/web/login/smscode", {
    method: "POST",
    body: { phone, smscode },
  });
  if (res?.data?.token) {
    setToken(res.data.token);
  }
  return res;
}

// ──────────────────── User ────────────────────

export async function getUserInfo() {
  return request(NOTES_API, "/voicenotes/web/user/info");
}

// ──────────────────── Notes ────────────────────

export async function listNotes(page = 1, pageSize = 20) {
  return request(NOTES_API, "/voicenotes/web/notes", {
    params: { page, page_size: pageSize },
  });
}

export async function getNote(noteId: string) {
  return request(NOTES_API, `/voicenotes/web/notes/${noteId}`);
}

export async function getNoteFromLegacy(idOrPrime: string) {
  return request(LEGACY_API, `/voicenotes/web/notes/${idOrPrime}`);
}

export async function searchNotes(query: string, page = 1, pageSize = 20) {
  return request(NOTES_API, "/voicenotes/web/notes/search", {
    params: { query, page, page_size: pageSize },
  });
}

export async function searchKnowledgeNotes(query: string, page = 1, pageSize = 20) {
  return request(NOTES_API, "/voicenotes/web/notes/knowledge/search", {
    params: { query, page, page_size: pageSize },
  });
}

export async function getNotesCount() {
  return request(NOTES_API, "/voicenotes/web/notes/count");
}

export async function getGeneratingCount() {
  return request(NOTES_API, "/voicenotes/web/notes/generating-count");
}

export async function getExportOptions() {
  return request(LEGACY_API, "/voicenotes/web/notes/export-options");
}

export async function getPromptTemplates() {
  return request(NOTES_API, "/voicenotes/web/notes/prompt_templates");
}

export async function createNote(params: Record<string, unknown>) {
  return request(NOTES_API, "/voicenotes/web/notes", {
    method: "POST",
    body: params,
  });
}

export async function createNoteInTopic(params: Record<string, unknown>) {
  return request(LEGACY_API, "/voicenotes/web/topics/notes", {
    method: "POST",
    body: params,
  });
}

export async function updateNote(primeId: string, full: Record<string, unknown>) {
  return request(LEGACY_API, `/voicenotes/web/notes/${primeId}`, {
    method: "PUT",
    body: full,
  });
}

export async function deleteNote(primeId: string) {
  return request(LEGACY_API, `/voicenotes/web/notes/${primeId}`, {
    method: "DELETE",
  });
}

// ──────────────────── Recycle Bin ────────────────────

export interface RecycleListOptions {
  limit?: number;
  sinceId?: string;
  range?: 0 | 1;
  search?: string;
}

export async function listRecycledNotes(options: RecycleListOptions = {}) {
  return request(NOTES_API, "/voicenotes/web/notes/recycle/search", {
    method: "POST",
    body: {
      search: options.search ?? "",
      limit: options.limit ?? 20,
      since_id: options.sinceId ?? "",
      range: options.range ?? 1,
    },
  });
}

export async function searchRecycledNotes(query = "", options: Omit<RecycleListOptions, "search"> = {}) {
  return listRecycledNotes({ ...options, search: query });
}

export async function recycleOpBatch(ids: string[], op: "resume" | "del") {
  return request(NOTES_API, "/voicenotes/web/notes/recycle/op/batch", {
    method: "POST",
    body: { ids_str: ids, op },
  });
}

export async function recycleClear() {
  return request(NOTES_API, "/voicenotes/web/notes/recycle/op/clear", {
    method: "DELETE",
  });
}

// ──────────────────── Tags ────────────────────

export async function listTags(page = 1, pageSize = 100) {
  return request(NOTES_API, "/voicenotes/web/tags", {
    params: { page, page_size: pageSize },
  });
}

export async function searchTags(query: string) {
  return request(NOTES_API, "/voicenotes/web/tags/search", {
    params: { query },
  });
}

export async function getTagOptions(page = 1) {
  return request(NOTES_API, "/voicenotes/web/tags/options", {
    params: { page },
  });
}

export async function getTagNotes(tagId: string, page = 1, pageSize = 20) {
  return request(NOTES_API, `/voicenotes/web/tags/${tagId}/note_list`, {
    params: { page_size: pageSize, page },
  });
}

export async function createTag(name: string, noteIds?: string[]) {
  return request(NOTES_API, "/voicenotes/web/tags", {
    method: "POST",
    body: { name, note_ids: noteIds || [] },
  });
}

export async function deleteTag(tagId: string) {
  return request(NOTES_API, `/voicenotes/web/tags/${tagId}`, {
    method: "DELETE",
  });
}

// ──────────────────── Topics (Notebooks) ────────────────────

export async function listMyTopics(page = 1, pageSize = 20) {
  return request(OPEN_API, "/v1/web/topic/mine/list", {
    params: { page, page_size: pageSize },
  });
}

export async function listTopics() {
  return request(OPEN_API, "/v1/web/topic/list");
}

export async function getTopicDetail(idAlias: string) {
  return request(OPEN_API, "/v1/web/topic/detail", {
    params: { id_alias: idAlias },
  });
}

export async function getTopicIntro(idAlias: string) {
  return request(OPEN_API, "/v1/web/topic/detail/intro", {
    params: { id_alias: idAlias },
  });
}

export async function createTopic(name: string, description?: string) {
  return request(OPEN_API, "/v1/web/topic/create", {
    method: "POST",
    body: { name, description },
  });
}

export async function editTopic(id: string, name: string, description?: string) {
  return request(OPEN_API, "/v1/web/topic/edit", {
    method: "POST",
    body: { id, name, description },
  });
}

export async function deleteTopic(id: string) {
  return request(OPEN_API, "/v1/web/topic/delete", {
    method: "POST",
    body: { id },
  });
}

export async function searchMyTopics(query: string, page = 1, pageSize = 20) {
  return request(OPEN_API, "/v1/web/topic/mine/search", {
    params: { query, page, page_size: pageSize },
  });
}

export async function listTopicResources(topicIdAlias: string, page = 1, pageSize = 20) {
  return request(OPEN_API, "/v1/web/topic/resource/list/mix", {
    params: { topic_id: -1, topic_id_alias: topicIdAlias, page, page_size: pageSize },
  });
}

export async function searchTopicResources(query: string, page = 1, pageSize = 20) {
  return request(OPEN_API, "/v1/web/topic/resource/search", {
    params: { query, page, page_size: pageSize },
  });
}

export async function getTopicsByNote(noteId: string) {
  return request(OPEN_API, "/v1/web/topic/list/by/noteid", {
    params: { note_id: noteId },
  });
}

// ──────────────────── Topic Directories ────────────────────

export async function createTopicDirectory(topicId: string, name: string, parentId?: string) {
  return request(OPEN_API, "/v1/web/topic/directory/create", {
    method: "POST",
    body: { topic_id: topicId, name, parent_id: parentId },
  });
}

export async function editTopicDirectory(directoryId: string, name: string) {
  return request(OPEN_API, "/v1/web/topic/directory/edit", {
    method: "POST",
    body: { id: directoryId, name },
  });
}

export async function deleteTopicDirectory(directoryId: string) {
  return request(OPEN_API, "/v1/web/topic/directory/delete", {
    method: "POST",
    body: { id: directoryId },
  });
}

export async function moveToDirectory(resourceIds: string[], directoryId: string) {
  return request(OPEN_API, "/v1/web/topic/resource/move/directory", {
    method: "POST",
    body: { resource_ids: resourceIds, directory_id: directoryId },
  });
}

/**
 * Remove a resource from a KB topic ("移出知识库"). The underlying note stays in
 * the user's "all notes" — only its topic binding is detached.
 *
 * @param resourceId  numeric `resources[].id` from {@link listKbTopicResources}
 * @param topicId     numeric topic id
 */
export async function removeResourceFromTopic(resourceId: number | string, topicId: number | string) {
  return request(OPEN_API, "/v1/web/topic/resource/delete", {
    method: "DELETE",
    body: { id: Number(resourceId), topic_id: Number(topicId) },
  });
}

/** Move a resource between two KB topics. Target directory must belong to the target topic. */
export async function moveResourceToTopic(
  resourceId: number | string,
  fromTopicId: number | string,
  targetTopicId: number | string,
  targetDirectoryId: number | string,
) {
  return request(OPEN_API, "/v1/web/topic/resource/move/topic", {
    method: "POST",
    body: {
      resource_id: Number(resourceId),
      topic_id: Number(fromTopicId),
      target_topic_id: Number(targetTopicId),
      target_topic_dir_id: Number(targetDirectoryId),
    },
  });
}

/**
 * Attach one or more existing notes to a KB topic directory.
 * Mirrors the biji.com "加入笔记本" action — the notes stay in their original
 * location and become a resource inside the topic directory.
 *
 * @param noteIds      one or more note_id values (from `note.note_id`, NOT prime_id)
 * @param topicId      numeric topic id; see {@link listKbManagedTopics} → list[].id
 * @param directoryId  directory id under the topic; use topic.root_dir.id for the root
 */
export async function importNotesToTopic(
  noteIds: string | string[],
  topicId: number | string,
  directoryId: number | string,
) {
  const ids = Array.isArray(noteIds) ? noteIds.join(",") : noteIds;
  return request(LEGACY_API, "/voicenotes/web/topics/import/notes", {
    method: "POST",
    body: { ids, topic_id: Number(topicId), directory_id: Number(directoryId) },
  });
}

// ──────────────────── Follow / Watch ────────────────────

export async function listFollows() {
  return request(OPEN_API, "/v1/web/follow/list", {
    params: { topic_id: -1, topic_id_alias: "" },
  });
}

export async function createFollow(url: string) {
  return request(OPEN_API, "/v1/web/follow/create", {
    method: "POST",
    body: { url },
  });
}

export async function deleteFollow(followId: string) {
  return request(OPEN_API, "/v1/web/follow/delete", {
    method: "POST",
    body: { id: followId },
  });
}

export async function getFollowPosts(followId: string) {
  return request(OPEN_API, "/v1/web/follow/account/posts", {
    method: "POST",
    body: { id: followId },
  });
}

export async function listWatchedBloggers(page = 1, pageSize = 20) {
  return request(OPEN_API, "/v1/web/follow/watch/blogger/list", {
    params: { page, page_size: pageSize },
  });
}

// ──────────────────── Team ────────────────────

export async function listTeams(isOwner?: boolean) {
  return request(OPEN_API, "/v1/web/team/list", {
    params: isOwner !== undefined ? { is_owner: isOwner ? 1 : 0 } : {},
  });
}

export async function getTeamInfo(idAlias: string) {
  return request(OPEN_API, "/v1/web/team/info", {
    params: { id_alias: idAlias },
  });
}

export async function createTeam(name: string) {
  return request(OPEN_API, "/v1/web/team/create", {
    method: "POST",
    body: { name },
  });
}

export async function listTeamMembers(teamId: string, page = 1, pageSize = 20) {
  return request(OPEN_API, "/v1/web/team/member/list", {
    params: { team_id: teamId, page, page_size: pageSize },
  });
}

// ──────────────────── Sync / Export ────────────────────

export type ExportFormat = "pdf" | "docx" | "md" | "mp3";

export interface ExportTask {
  id: string;
  type: ExportFormat | string;
  /** Presigned download URL — populated once `status === "success"`. */
  access_url: string;
  filename: string;
  status: "scheduled" | "running" | "success" | "failed" | string;
  finished: boolean;
  total: number;
  create_time: number;
  update_time: number;
  result?: { percent?: number; success?: number; failed?: number; pending?: number };
}

export async function listExportTasks(latest?: string) {
  return request<{ c?: ExportTask[] }>(LEGACY_API, "/voicenotes/web/export/tasks", {
    params: latest ? { latest } : {},
  });
}

/** Create an export task. Server returns the task id; poll {@link getExportTask} for the access_url. */
export async function createExportTask(noteIds: string[], type: ExportFormat) {
  return request<{ c?: ExportTask }>(LEGACY_API, "/voicenotes/web/export/tasks", {
    method: "POST",
    body: { type, note_ids: noteIds },
  });
}

export async function getExportTask(taskId: string) {
  return request<{ c?: ExportTask }>(LEGACY_API, `/voicenotes/web/export/tasks/${taskId}`);
}

/**
 * Poll an export task until it finishes (or `timeoutMs` elapses).
 * Returns the final task — `access_url` is the presigned OSS download link.
 */
export async function waitForExportTask(
  taskId: string,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<ExportTask> {
  const start = Date.now();
  const interval = options.pollIntervalMs ?? 1000;
  const timeout = options.timeoutMs ?? 120000;
  while (true) {
    const resp = await getExportTask(taskId);
    const task = resp.c;
    if (!task) throw new Error(`export task ${taskId} not found`);
    if (task.finished || task.status === "success" || task.status === "failed") return task;
    if (Date.now() - start > timeout) {
      throw new Error(`export task ${taskId} timed out after ${timeout}ms (last status: ${task.status})`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

export async function listArchiveTasks(source?: string) {
  return request(NOTES_API, "/voicenotes/web/sync/archive/tasks", {
    params: source ? { source } : {},
  });
}

export async function createArchive(noteIds: string[]) {
  return request(NOTES_API, "/voicenotes/web/sync/archive/create", {
    method: "POST",
    body: { note_ids: noteIds },
  });
}

// ──────────────────── Import ────────────────────

export async function getImportRecords() {
  return request(NOTES_API, "/voicenotes/web/topics/import/records");
}

// ──────────────────── Share ────────────────────

export async function getSharedTopicNotes(topicId: string) {
  return request(NOTES_API, `/voicenotes/web/share/topics/${topicId}/notes`);
}

export async function getSharedNote(noteId: string) {
  return request(NOTES_API, `/voicenotes/web/share/notes/${noteId}`);
}

// ──────────────────── Search History ────────────────────

export async function getSearchHistory(topicId?: string) {
  return request(OPEN_API, "/v1/web/search/history", {
    params: { topic_id: topicId || "" },
  });
}

export async function deleteSearchHistory(ids: string[]) {
  return request(OPEN_API, "/v1/web/search/history/delete", {
    method: "POST",
    body: { ids },
  });
}

// ──────────────────── OpenAPI Token Management ────────────────────

export async function listOpenapiTokens(topicId: string) {
  return request(OPEN_API, "/v1/web/openapi/token/list", {
    params: { topic_id: topicId },
  });
}

export async function createOpenapiToken(topicId: string) {
  return request(OPEN_API, "/v1/web/openapi/token/create", {
    method: "POST",
    body: { topic_id: topicId },
  });
}

export async function renewOpenapiToken(tokenId: string) {
  return request(OPEN_API, "/v1/web/openapi/token/renew", {
    method: "POST",
    body: { id: tokenId },
  });
}

export async function deleteOpenapiToken(tokenId: string) {
  return request(OPEN_API, "/v1/web/openapi/token/delete", {
    method: "POST",
    body: { id: tokenId },
  });
}

// ──────────────────── AI: Note Analysis ────────────────────

export async function getNoteLinkDetails(noteId: string) {
  return request(NOTES_API, `/voicenotes/web/notes/${noteId}/links/detail`);
}

export async function generateNoteTags(noteId: string, content?: string, title?: string) {
  return request(NOTES_API, `/voicenotes/web/notes/${noteId}/generate-tags`, {
    method: "POST",
    body: { content, title },
  });
}

export async function addNoteTags(noteId: string, tags: string[]) {
  return request(NOTES_API, `/voicenotes/web/notes/${noteId}/tags`, {
    method: "POST",
    body: { tags },
  });
}

export async function removeNoteTag(noteId: string, tagId: string) {
  return request(NOTES_API, `/voicenotes/web/notes/${noteId}/tags/${tagId}`, {
    method: "DELETE",
  });
}

export async function getRelatedNotes(noteId: string) {
  return request(NOTES_API, `/voicenotes/web/notes/${noteId}/relation`);
}

export async function getNoteOriginal(noteId: string) {
  return request(NOTES_API, `/voicenotes/web/notes/${noteId}/original`);
}

export async function createNoteStream(params: Record<string, unknown>, options?: SseOptions): Promise<SseResult> {
  return requestSSE(LEGACY_API, "/voicenotes/web/notes/stream", params, options);
}

export async function createTopicNoteStream(params: Record<string, unknown>, options?: SseOptions): Promise<SseResult> {
  return requestSSE(LEGACY_API, "/voicenotes/web/topics/notes/stream", params, options);
}

export interface AiAnalyzeLinkOptions extends SseOptions {
  /** Custom instruction to steer the AI summary. Sent as the `content` field. */
  prompt?: string;
  /** Numeric topic id (string form, e.g. "3623874"). Required to drop into a KB topic. */
  topic_id?: string;
  /** Directory id under the topic. When parsing into a KB topic root, pass the topic's `root_dir.id`. */
  topic_directory_id?: string;
  client_note_id?: string;
}

export async function aiAnalyzeLink(url: string, options?: AiAnalyzeLinkOptions): Promise<SseResult> {
  const clientNoteId = options?.client_note_id ?? globalThis.crypto.randomUUID();
  const body: Record<string, unknown> = {
    attachments: [{ size: 100, type: "link", url }],
    content: options?.prompt ?? "",
    entry_type: "ai",
    note_type: "link",
    source: "web",
    client_note_id: clientNoteId,
  };
  const path = options?.topic_id ? "/voicenotes/web/topics/notes/stream" : "/voicenotes/web/notes/stream";
  if (options?.topic_id) body.topic_id = options.topic_id;
  if (options?.topic_directory_id) body.topic_directory_id = options.topic_directory_id;
  return requestSSE(LEGACY_API, path, body, { onChunk: options?.onChunk });
}

// ──────────────────── AI: Yoda Chat ────────────────────

export async function createYodaChat(upstream: string, resId?: string) {
  return request(YODA_API, "/yoda/web/v1/chats", {
    method: "POST",
    body: { upstream, res_id: resId },
  });
}

export async function listYodaChats(pageCursor?: string, pageSize = 15, upstream?: string, upstreamId?: string) {
  const params: Record<string, string | number> = { page_size: pageSize };
  if (pageCursor) params.page_cursor = pageCursor;
  if (upstream) params.upstream = upstream;
  if (upstreamId) params.upstream_id = upstreamId;
  return request(YODA_API, "/yoda/web/v1/chats", { params });
}

export async function getYodaChatMessages(sessionId: string, pageCursor?: string, pageSize = 20) {
  const params: Record<string, string | number> = { page_size: pageSize };
  if (pageCursor) params.page_cursor = pageCursor;
  return request(YODA_API, `/yoda/web/v1/chats/${sessionId}`, { params });
}

export async function getYodaChatEntry(upstream: string, id?: string) {
  const params: Record<string, string | number> = { upstream };
  if (id) params.id = id;
  return request(YODA_API, "/yoda/web/v1/chats/entry", { params });
}

export async function yodaChatStream(body: Record<string, unknown>, options?: SseOptions): Promise<SseResult> {
  return requestSSE(YODA_API, "/yoda/web/v1/chats/stream", body, options);
}

export async function stopYodaChatStream(sessionId: string, messageId: string) {
  return request(YODA_API, "/yoda/web/v1/chats/stop-stream", {
    method: "POST",
    body: { session_id: sessionId, message_id: messageId },
  });
}

export async function getYodaStartupQuestions(params?: Record<string, unknown>) {
  return request(YODA_API, "/yoda/web/v1/chats/startup_questions", {
    method: "POST",
    body: params || {},
  });
}

export async function getYodaStartupShortcuts(upstream: string, upstreamEntityId?: string) {
  return request(YODA_API, "/yoda/web/v1/chats/startup_shortcuts", {
    method: "POST",
    body: { upstream, upstream_entity_id: upstreamEntityId },
  });
}

export async function setYodaChatTitle(sessionId: string, title: string) {
  return request(YODA_API, `/yoda/web/v1/chats/${sessionId}/title`, {
    method: "POST",
    body: { session_id: sessionId, title },
  });
}

export async function getYodaSharedChat(shareId: string) {
  return request(YODA_API, "/yoda/web/v1/chats/share", {
    params: { share_id: shareId },
  });
}

export async function getYodaResourceConfig() {
  return request(YODA_API, "/yoda/web/v1/chats/question_resource/config");
}

export async function getYodaInputRestrict() {
  return request(YODA_API, "/yoda/web/v1/chats/llm_input_restrict", {
    method: "POST",
    body: {},
  });
}

export async function sendYodaFeedback(params: {
  feedbackType?: string;
  messageId: string;
  sessionId: string;
  comment?: string;
  presetOption?: string;
}) {
  return request(YODA_API, "/yoda/web/v1/feedback", {
    method: "POST",
    body: {
      feedback_type: params.feedbackType || "thumbs_down",
      message_id: params.messageId,
      session_id: params.sessionId,
      custom_comment: params.comment || "",
      preset_option: params.presetOption || "",
    },
  });
}

export async function createYodaAiNote(params: Record<string, unknown>) {
  return request(YODA_API, "/yoda/web/v1/notes", {
    method: "POST",
    body: params,
  });
}

// ──────────────────── AI: Writing ────────────────────

export async function aiWritingStream(params: Record<string, unknown>, options?: SseOptions): Promise<SseResult> {
  return requestSSE(YODA_API, "/yoda/web/v1/writing/stream", params, options);
}

export async function listAiWriters() {
  return request(YODA_API, "/yoda/web/v1/writing/writer/list");
}

// ──────────────────── AI: Style ────────────────────

export async function aiStyleGenStream(params: Record<string, unknown>, options?: SseOptions): Promise<SseResult> {
  return requestSSE(YODA_API, "/yoda/web/v1/style/gen/stream", params, options);
}

export async function listStylePolishers() {
  return request(YODA_API, "/yoda/web/v1/style/polisher/list");
}

export async function listStyles() {
  return request(YODA_API, "/yoda/web/v1/style/list");
}

export async function getStyle(params: Record<string, unknown>) {
  return request(YODA_API, "/yoda/web/v1/style/get", { params: params as Record<string, string | number> });
}

export async function createStyle(params: Record<string, unknown>) {
  return request(YODA_API, "/yoda/web/v1/style/create", {
    method: "POST",
    body: params,
  });
}

export async function updateStyle(params: Record<string, unknown>) {
  return request(YODA_API, "/yoda/web/v1/style/update", {
    method: "POST",
    body: params,
  });
}

export async function deleteStyle(params: Record<string, unknown>) {
  return request(YODA_API, "/yoda/web/v1/style/delete", {
    method: "POST",
    body: params,
  });
}

export async function copyStyleFromShare(params: Record<string, unknown>) {
  return request(YODA_API, "/yoda/web/v1/style/copy/from/share", {
    method: "POST",
    body: params,
  });
}

// ──────────────────── AI: Canvas ────────────────────

export async function getCanvasNextVersion(params?: Record<string, string | number>) {
  return request(YODA_API, "/yoda/web/v1/canvas/next/version", { params });
}

export async function saveCanvas(params: Record<string, unknown>) {
  return request(YODA_API, "/yoda/web/v1/canvas/save", {
    method: "POST",
    body: params,
  });
}

export async function getCanvasHistory(params?: Record<string, string | number>) {
  return request(YODA_API, "/yoda/web/v1/canvas/history", { params });
}

export async function getCanvasHistoryAll(params?: Record<string, string | number>) {
  return request(YODA_API, "/yoda/web/v1/canvas/history/all", { params });
}

export async function findCanvasEntity(params?: Record<string, string | number>) {
  return request(YODA_API, "/yoda/web/v1/canvas/bind/find/entity", { params });
}

// ──────────────────── AI: Knowledge Base ────────────────────

export async function listKnowledgeBooks(page = 1, pageSize = 20) {
  return request(NOTES_API, "/knowledge/v1/web/topic/list/books", {
    params: { page, page_size: pageSize },
    extraHeaders: { "X-Topic-Scope": "BOOKSPACE" },
  });
}

export async function searchKnowledgeBooks(query: string, page = 1, pageSize = 20) {
  return request(NOTES_API, "/knowledge/v1/web/topic/mine/search/list", {
    params: { query, page, page_size: pageSize },
  });
}

/**
 * List the user-managed topics shown under the "知识库" sidebar on the web app.
 * Different endpoint from {@link listMyTopics} — this one is what biji.com itself
 * uses to render the KB tree, and returns extras like `root_dir`, `extend_data`,
 * `config.file_max_size`, `last_update_time_desc`, etc.
 */
export async function listKbManagedTopics(page = 1, size = 50, isSelection = 0) {
  return request(OPEN_API, "/v1/web/topic/list/manager", {
    params: { is_selection: isSelection, page, size },
    extraHeaders: { "X-Av": "1.2.2" },
  });
}

/**
 * List the resources (notes / files) inside one KB topic directory.
 *
 * @param topicIdAlias  short id_alias from {@link listKbManagedTopics} (e.g. "pYLReLmJ")
 * @param directoryId   numeric id of the directory; pass the topic's `root_dir.id` for the root level
 */
export async function listKbTopicResources(
  topicIdAlias: string,
  directoryId: number | string,
  options: { page?: number; sort?: string; resourceType?: number } = {},
) {
  return request(OPEN_API, "/v1/web/topic/resource/list/mix", {
    params: {
      topic_id: -1,
      topic_id_alias: topicIdAlias,
      directory_id: String(directoryId),
      sort: options.sort ?? "create_time_desc",
      resource_type: options.resourceType ?? 0,
      page: options.page ?? 1,
    },
  });
}

// ──────────────────── Local Media Upload (audio / video) ────────────────────

export type LocalMediaKind = "audio" | "video";

export interface LocalMediaTokenRequest {
  /** Original filename, e.g. "podcast.mp3" or "clip.mp4". */
  local_name: string;
  /** Base64-encoded MD5 of the raw file bytes (= `crypto.createHash('md5').update(buf).digest('base64')`). */
  md5: string;
  size_byte: number;
  /** Duration in milliseconds. Required by biji for both audio and video. */
  duration_ms: number;
  /** Container/codec hint, e.g. "mp3", "m4a", "wav", "mp4". */
  type: string;
}

export interface LocalMediaTokenInfo {
  object_key: string;
  /** Aliyun OSS presigned PUT URL — upload raw bytes here. */
  put_sign_url: string;
  put_internal_sign_url?: string;
  /** Base64-encoded OSS callback config — set as `x-oss-callback` header on the PUT. */
  put_callback: string;
  put_content_type: string;
  /** Echo of the MD5 the server expects. Set as `Content-MD5` header on the PUT. */
  put_md5: string;
  /** Presigned GET URL — use this as the `attachments[0].url` in the subsequent AI stream call. */
  get_url: string;
  acl_private: boolean;
}

export interface LocalMediaTokenResponse {
  is_uploaded: boolean;
  uploaded_url: string;
  token_info: LocalMediaTokenInfo;
  file_id: string;
}

/** Step 1: request an OSS presigned URL for a local audio file. */
export async function getLocalAudioUploadToken(req: LocalMediaTokenRequest) {
  return request<{ c?: LocalMediaTokenResponse }>(LEGACY_API, "/voicenotes/web/notes/local_audio/token", {
    method: "POST",
    body: req,
  });
}

/** Step 1 for video — biji uses a parallel endpoint, mirroring the audio shape. */
export async function getLocalVideoUploadToken(req: LocalMediaTokenRequest) {
  return request<{ c?: LocalMediaTokenResponse }>(LEGACY_API, "/voicenotes/web/notes/local_video/token", {
    method: "POST",
    body: req,
  });
}

/**
 * Step 2: PUT raw bytes to the Aliyun OSS presigned URL.
 *
 * Includes the OSS callback header that triggers biji's `notify.luojilab.com` webhook,
 * which is what binds the uploaded file to `file_id` for the subsequent AI stream call.
 */
export async function uploadMediaToOss(token: LocalMediaTokenInfo, bytes: ArrayBuffer | Uint8Array): Promise<void> {
  const view = bytes instanceof Uint8Array
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes);
  const resp = await fetch(token.put_sign_url, {
    method: "PUT",
    headers: {
      "Content-Type": token.put_content_type,
      "Content-MD5": token.put_md5,
      "x-oss-callback": token.put_callback,
    },
    body: view as unknown as BodyInit,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OSS PUT failed: ${resp.status} ${resp.statusText}\n${text.slice(0, 500)}`);
  }
}

export interface AiAnalyzeLocalMediaOptions extends SseOptions {
  /** Optional custom prompt (sent as the `content` field). */
  prompt?: string;
  /** Drop into a KB topic — pass numeric id (string form). */
  topic_id?: string;
  /** Directory inside the topic. Use the topic's `root_dir.id` for the root level. */
  topic_directory_id?: string;
  client_note_id?: string;
  /** "custom" (default) lets biji infer; some flows use named template ids. */
  prompt_template_id?: string;
}

function buildLocalMediaBody(
  kind: LocalMediaKind,
  token: LocalMediaTokenResponse,
  durationMs: number,
  options: AiAnalyzeLocalMediaOptions | undefined,
): Record<string, unknown> {
  const clientNoteId = options?.client_note_id ?? globalThis.crypto.randomUUID();
  const body: Record<string, unknown> = {
    prompt_template_id: options?.prompt_template_id ?? "custom",
    note_id: "0",
    file_id: token.file_id,
    attachments: [
      {
        action_time: Date.now(),
        size: 0,
        type: kind,
        title: "",
        url: token.token_info.get_url,
        duration: durationMs,
      },
    ],
    content: options?.prompt ?? "",
    entry_type: "ai",
    note_type: kind === "audio" ? "local_audio" : "local_video",
    source: "web",
    client_note_id: clientNoteId,
  };
  if (options?.topic_id) body.topic_id = options.topic_id;
  if (options?.topic_directory_id) body.topic_directory_id = options.topic_directory_id;
  return body;
}

/**
 * Step 3 for audio: kick off the SSE AI stream that does ASR + structured note generation.
 * Pass the {@link LocalMediaTokenResponse} returned from {@link getLocalAudioUploadToken}
 * AFTER you've completed the OSS PUT.
 */
export async function aiAnalyzeLocalAudio(
  token: LocalMediaTokenResponse,
  durationMs: number,
  options?: AiAnalyzeLocalMediaOptions,
): Promise<SseResult> {
  const body = buildLocalMediaBody("audio", token, durationMs, options);
  const path = options?.topic_id
    ? "/voicenotes/web/topics/notes/stream_on_local_audio"
    : "/voicenotes/web/notes/stream_on_local_audio";
  return requestSSE(LEGACY_API, path, body, { onChunk: options?.onChunk });
}

/** Step 3 for video — same shape as audio with `local_video` paths. */
export async function aiAnalyzeLocalVideo(
  token: LocalMediaTokenResponse,
  durationMs: number,
  options?: AiAnalyzeLocalMediaOptions,
): Promise<SseResult> {
  const body = buildLocalMediaBody("video", token, durationMs, options);
  const path = options?.topic_id
    ? "/voicenotes/web/topics/notes/stream_on_local_video"
    : "/voicenotes/web/notes/stream_on_local_video";
  return requestSSE(LEGACY_API, path, body, { onChunk: options?.onChunk });
}

export async function getYodaPublicShare(shareId: string) {
  return request(YODA_API, `/yoda/web/v1/share/public/${shareId}`);
}

// ──────────────────── AI: Blogger Recognition ────────────────────

export async function recognizeWeixinBlogger(url: string) {
  return request(OPEN_API, "/v1/web/follow/weixin/blogger_recognize", {
    method: "POST",
    body: { url },
  });
}
