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
  return request(NOTES_API, "/voicenotes/web/notes/export-options");
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
  return request(NOTES_API, "/voicenotes/web/topics/notes", {
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

export async function searchRecycledNotes(query?: string) {
  return request(NOTES_API, "/voicenotes/web/notes/recycle/search", {
    params: query ? { query } : {},
  });
}

export async function recycleOpBatch(noteIds: string[], op: "restore" | "delete") {
  return request(NOTES_API, "/voicenotes/web/notes/recycle/op/batch", {
    method: "POST",
    body: { note_ids: noteIds, op },
  });
}

export async function recycleClear() {
  return request(NOTES_API, "/voicenotes/web/notes/recycle/op/clear", {
    method: "POST",
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

export async function listExportTasks(latest?: string) {
  return request(NOTES_API, "/voicenotes/web/sync/export/tasks", {
    params: latest ? { latest } : {},
  });
}

export async function createExportTask(noteIds: string[], format?: string) {
  return request(NOTES_API, "/voicenotes/web/sync/export/create", {
    method: "POST",
    body: { note_ids: noteIds, format },
  });
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
  prompt_template_id?: string;
  topic_id?: string;
  client_note_id?: string;
}

export async function aiAnalyzeLink(url: string, options?: AiAnalyzeLinkOptions): Promise<SseResult> {
  const clientNoteId = options?.client_note_id ?? globalThis.crypto.randomUUID();
  const body: Record<string, unknown> = {
    attachments: [{ size: 100, type: "link", title: "", url }],
    content: "",
    entry_type: "ai",
    note_type: "link",
    source: "web",
    prompt_template_id: options?.prompt_template_id ?? "",
    client_note_id: clientNoteId,
  };
  const path = options?.topic_id ? "/voicenotes/web/topics/notes/stream" : "/voicenotes/web/notes/stream";
  if (options?.topic_id) body.topic_id = options.topic_id;
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
