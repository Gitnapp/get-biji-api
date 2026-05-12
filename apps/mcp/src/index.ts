#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as api from "@biji/client";

const server = new McpServer({
  name: "get-biji",
  version: "1.0.0",
  description: "MCP server for Get笔记 (biji.com) — AI-driven note-taking app",
});

// ──────────────────── Auth Tools ────────────────────

server.tool(
  "set_token",
  "Set the Bearer token for API authentication (no auto-refresh). For long sessions, use set_auth instead.",
  { token: z.string().describe("Bearer token from biji.com") },
  async ({ token }) => {
    api.setToken(token);
    try {
      const info = await api.getUserInfo();
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
    } catch {
      return { content: [{ type: "text", text: "Token set. Could not verify — please check if valid." }] };
    }
  }
);

server.tool(
  "set_auth",
  "Set full authentication with auto-refresh support. Provide all 4 values from browser localStorage (token, token_expire_at, refresh_token, refresh_token_expire_at). The refresh_token lasts ~90 days and the JWT will auto-refresh before each API call.",
  {
    token: z.string().describe("JWT from localStorage.getItem('token')"),
    token_expire_at: z.number().describe("Token expiry timestamp from localStorage.getItem('token_expire_at')"),
    refresh_token: z.string().describe("Refresh token from localStorage.getItem('refresh_token')"),
    refresh_token_expire_at: z.number().describe("Refresh token expiry from localStorage.getItem('refresh_token_expire_at')"),
  },
  async ({ token, token_expire_at, refresh_token, refresh_token_expire_at }) => {
    api.setAuth({ token, token_expire_at, refresh_token, refresh_token_expire_at });
    const now = Math.floor(Date.now() / 1000);
    const jwtRemain = token_expire_at - now;
    const refreshRemain = refresh_token_expire_at - now;
    try {
      const info = await api.getUserInfo();
      const uid = (info as Record<string, unknown>)?.c
        ? ((info as Record<string, Record<string, Record<string, unknown>>>).c.data.uid)
        : "unknown";
      return {
        content: [{
          type: "text",
          text: `Auth set for uid ${uid}.\nJWT expires in ${Math.floor(jwtRemain / 60)} min (auto-refresh enabled).\nRefresh token expires in ${Math.floor(refreshRemain / 86400)} days.`,
        }],
      };
    } catch {
      return {
        content: [{
          type: "text",
          text: `Auth set. JWT expires in ${Math.floor(jwtRemain / 60)} min, refresh token in ${Math.floor(refreshRemain / 86400)} days. Could not verify — check values.`,
        }],
      };
    }
  }
);

server.tool(
  "get_auth_status",
  "Check current authentication status (token expiry, refresh token expiry)",
  {},
  async () => {
    const auth = api.getAuth();
    const now = Math.floor(Date.now() / 1000);
    if (!auth.token) {
      return { content: [{ type: "text", text: "Not authenticated. Use set_token or set_auth." }] };
    }
    const jwtRemain = auth.token_expire_at ? auth.token_expire_at - now : -1;
    const refreshRemain = auth.refresh_token_expire_at ? auth.refresh_token_expire_at - now : -1;
    const lines = [
      `Token: ${auth.token.slice(0, 20)}...`,
      auth.token_expire_at ? `JWT expires in: ${Math.floor(jwtRemain / 60)} min${jwtRemain < 0 ? " (EXPIRED)" : ""}` : "JWT expiry: unknown (no auto-refresh)",
      auth.refresh_token ? `Refresh token: set (expires in ${Math.floor(refreshRemain / 86400)} days)` : "Refresh token: not set (no auto-refresh)",
      auth.refresh_token ? "Auto-refresh: enabled" : "Auto-refresh: disabled",
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "send_sms_code",
  "Send SMS verification code to phone number for login",
  {
    phone: z.string().describe("Phone number (e.g. 13800138000)"),
    captcha_token: z.string().optional().describe("Captcha token if required"),
  },
  async ({ phone, captcha_token }) => {
    const res = await api.sendSmsCode(phone, captcha_token);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "login_with_sms",
  "Login with phone number and SMS verification code",
  {
    phone: z.string().describe("Phone number"),
    smscode: z.string().describe("SMS verification code"),
  },
  async ({ phone, smscode }) => {
    const res = await api.loginWithSms(phone, smscode);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── User Tools ────────────────────

server.tool("get_user_info", "Get current logged-in user information", {}, async () => {
  const res = await api.getUserInfo();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

// ──────────────────── Notes Tools ────────────────────

server.tool(
  "list_notes",
  "List notes with pagination",
  {
    page: z.number().optional().default(1).describe("Page number"),
    page_size: z.number().optional().default(20).describe("Items per page"),
  },
  async ({ page, page_size }) => {
    const res = await api.listNotes(page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "get_note",
  "Get a specific note by its ID",
  { note_id: z.string().describe("Note ID") },
  async ({ note_id }) => {
    const res = await api.getNote(note_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "search_notes",
  "Search notes by keyword",
  {
    query: z.string().describe("Search keyword"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ query, page, page_size }) => {
    const res = await api.searchNotes(query, page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "search_knowledge_notes",
  "Search notes in knowledge base",
  {
    query: z.string().describe("Search keyword"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ query, page, page_size }) => {
    const res = await api.searchKnowledgeNotes(query, page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("get_notes_count", "Get total notes count", {}, async () => {
  const res = await api.getNotesCount();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

server.tool("get_prompt_templates", "Get available AI prompt templates for notes", {}, async () => {
  const res = await api.getPromptTemplates();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

// ──────────────────── Recycle Bin Tools ────────────────────

server.tool(
  "list_recycled_notes",
  "List notes in the recycle bin",
  { query: z.string().optional().describe("Search in recycle bin") },
  async ({ query }) => {
    const res = await api.searchRecycledNotes(query);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "restore_recycled_notes",
  "Restore notes from recycle bin",
  { note_ids: z.array(z.string()).describe("Note prime_ids to restore") },
  async ({ note_ids }) => {
    const res = await api.recycleOpBatch(note_ids, "resume");
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "delete_recycled_notes",
  "Permanently delete notes from recycle bin",
  { note_ids: z.array(z.string()).describe("Note prime_ids to permanently delete") },
  async ({ note_ids }) => {
    const res = await api.recycleOpBatch(note_ids, "del");
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("clear_recycle_bin", "Clear all notes in recycle bin", {}, async () => {
  const res = await api.recycleClear();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

// ──────────────────── Tags Tools ────────────────────

server.tool(
  "list_tags",
  "List all tags",
  {
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(100),
  },
  async ({ page, page_size }) => {
    const res = await api.listTags(page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "search_tags",
  "Search tags by keyword",
  { query: z.string().describe("Search keyword") },
  async ({ query }) => {
    const res = await api.searchTags(query);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "get_tag_notes",
  "Get notes under a specific tag",
  {
    tag_id: z.string().describe("Tag ID"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ tag_id, page, page_size }) => {
    const res = await api.getTagNotes(tag_id, page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "create_tag",
  "Create a new tag",
  {
    name: z.string().describe("Tag name"),
    note_ids: z.array(z.string()).optional().describe("Note IDs to add to the tag"),
  },
  async ({ name, note_ids }) => {
    const res = await api.createTag(name, note_ids);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "delete_tag",
  "Delete a tag",
  { tag_id: z.string().describe("Tag ID") },
  async ({ tag_id }) => {
    const res = await api.deleteTag(tag_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── Topics (Notebooks) Tools ────────────────────

server.tool("list_topics", "List all topics/notebooks", {}, async () => {
  const res = await api.listTopics();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

server.tool(
  "list_my_topics",
  "List my topics/notebooks with pagination",
  {
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ page, page_size }) => {
    const res = await api.listMyTopics(page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "get_topic_detail",
  "Get topic/notebook detail by alias ID",
  { id_alias: z.string().describe("Topic alias ID") },
  async ({ id_alias }) => {
    const res = await api.getTopicDetail(id_alias);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "create_topic",
  "Create a new topic/notebook",
  {
    name: z.string().describe("Topic name"),
    description: z.string().optional().describe("Topic description"),
  },
  async ({ name, description }) => {
    const res = await api.createTopic(name, description);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "edit_topic",
  "Edit an existing topic/notebook",
  {
    id: z.string().describe("Topic ID"),
    name: z.string().describe("New topic name"),
    description: z.string().optional().describe("New description"),
  },
  async ({ id, name, description }) => {
    const res = await api.editTopic(id, name, description);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "delete_topic",
  "Delete a topic/notebook",
  { id: z.string().describe("Topic ID") },
  async ({ id }) => {
    const res = await api.deleteTopic(id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "search_my_topics",
  "Search my topics by keyword",
  {
    query: z.string().describe("Search keyword"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ query, page, page_size }) => {
    const res = await api.searchMyTopics(query, page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "list_topic_resources",
  "List notes/resources in a topic",
  {
    topic_id_alias: z.string().describe("Topic alias ID"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ topic_id_alias, page, page_size }) => {
    const res = await api.listTopicResources(topic_id_alias, page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "get_topics_by_note",
  "Get which topics contain a specific note",
  { note_id: z.string().describe("Note ID") },
  async ({ note_id }) => {
    const res = await api.getTopicsByNote(note_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── Topic Directories ────────────────────

server.tool(
  "create_topic_directory",
  "Create a directory/folder inside a topic",
  {
    topic_id: z.string().describe("Topic ID"),
    name: z.string().describe("Directory name"),
    parent_id: z.string().optional().describe("Parent directory ID"),
  },
  async ({ topic_id, name, parent_id }) => {
    const res = await api.createTopicDirectory(topic_id, name, parent_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "edit_topic_directory",
  "Rename a directory in a topic",
  {
    directory_id: z.string().describe("Directory ID"),
    name: z.string().describe("New directory name"),
  },
  async ({ directory_id, name }) => {
    const res = await api.editTopicDirectory(directory_id, name);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "delete_topic_directory",
  "Delete a directory from a topic",
  { directory_id: z.string().describe("Directory ID") },
  async ({ directory_id }) => {
    const res = await api.deleteTopicDirectory(directory_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── Follow Tools ────────────────────

server.tool("list_follows", "List all followed sources", {}, async () => {
  const res = await api.listFollows();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

server.tool(
  "create_follow",
  "Follow a new content source by URL",
  { url: z.string().describe("URL to follow") },
  async ({ url }) => {
    const res = await api.createFollow(url);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "delete_follow",
  "Unfollow a content source",
  { follow_id: z.string().describe("Follow ID") },
  async ({ follow_id }) => {
    const res = await api.deleteFollow(follow_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "get_follow_posts",
  "Get posts from a followed source",
  { follow_id: z.string().describe("Follow ID") },
  async ({ follow_id }) => {
    const res = await api.getFollowPosts(follow_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── Team Tools ────────────────────

server.tool(
  "list_teams",
  "List teams",
  { is_owner: z.boolean().optional().describe("Filter by ownership") },
  async ({ is_owner }) => {
    const res = await api.listTeams(is_owner);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "get_team_info",
  "Get team details",
  { id_alias: z.string().describe("Team alias ID") },
  async ({ id_alias }) => {
    const res = await api.getTeamInfo(id_alias);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "create_team",
  "Create a new team",
  { name: z.string().describe("Team name") },
  async ({ name }) => {
    const res = await api.createTeam(name);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── Export Tools ────────────────────

server.tool(
  "export_notes",
  "Export notes to file",
  {
    note_ids: z.array(z.string()).describe("Note IDs to export"),
    format: z.string().optional().describe("Export format"),
  },
  async ({ note_ids, format }) => {
    const res = await api.createExportTask(note_ids, format);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("list_export_tasks", "List export task history", {}, async () => {
  const res = await api.listExportTasks();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

// ──────────────────── Share Tools ────────────────────

server.tool(
  "get_shared_note",
  "Get a shared note by ID",
  { note_id: z.string().describe("Shared note ID") },
  async ({ note_id }) => {
    const res = await api.getSharedNote(note_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── Search History Tools ────────────────────

server.tool(
  "get_search_history",
  "Get search history",
  { topic_id: z.string().optional().describe("Topic ID to filter by") },
  async ({ topic_id }) => {
    const res = await api.getSearchHistory(topic_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── OpenAPI Token Tools ────────────────────

server.tool(
  "list_openapi_tokens",
  "List OpenAPI tokens for a topic",
  { topic_id: z.string().describe("Topic ID") },
  async ({ topic_id }) => {
    const res = await api.listOpenapiTokens(topic_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "create_openapi_token",
  "Create a new OpenAPI token for a topic",
  { topic_id: z.string().describe("Topic ID") },
  async ({ topic_id }) => {
    const res = await api.createOpenapiToken(topic_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ══════════════════════════════════════════════════════════════
//  AI TOOLS
// ══════════════════════════════════════════════════════════════

// ──────────────────── AI: Note Analysis ────────────────────

server.tool(
  "get_note_link_details",
  "Get link details extracted from a note (AI-analyzed links within the note content)",
  { note_id: z.string().describe("Note ID") },
  async ({ note_id }) => {
    const res = await api.getNoteLinkDetails(note_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "ai_generate_tags",
  "AI auto-generate tags for a note based on its content",
  {
    note_id: z.string().describe("Note ID"),
    content: z.string().optional().describe("Note content (optional, fetched from note if omitted)"),
    title: z.string().optional().describe("Note title (optional)"),
  },
  async ({ note_id, content, title }) => {
    const res = await api.generateNoteTags(note_id, content, title);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "add_note_tags",
  "Add tags to a note",
  {
    note_id: z.string().describe("Note ID"),
    tags: z.array(z.string()).describe("Tag names to add"),
  },
  async ({ note_id, tags }) => {
    const res = await api.addNoteTags(note_id, tags);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "remove_note_tag",
  "Remove a tag from a note",
  {
    note_id: z.string().describe("Note ID"),
    tag_id: z.string().describe("Tag ID to remove"),
  },
  async ({ note_id, tag_id }) => {
    const res = await api.removeNoteTag(note_id, tag_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "get_related_notes",
  "Get AI-recommended related notes for a specific note",
  { note_id: z.string().describe("Note ID") },
  async ({ note_id }) => {
    const res = await api.getRelatedNotes(note_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "get_note_original",
  "Get the original content of a note (before AI processing)",
  { note_id: z.string().describe("Note ID") },
  async ({ note_id }) => {
    const res = await api.getNoteOriginal(note_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "create_note",
  "Create a new note",
  { params: z.record(z.string(), z.unknown()).describe("Note creation params (e.g. content, title, topic_id)") },
  async ({ params }) => {
    const res = await api.createNote(params);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "create_note_in_topic",
  "Create a new note inside a specific topic",
  { params: z.record(z.string(), z.unknown()).describe("Note creation params including topic_id") },
  async ({ params }) => {
    const res = await api.createNoteInTopic(params);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "create_note_stream",
  "Create a note with AI streaming (generates AI-enhanced note content)",
  { params: z.record(z.string(), z.unknown()).describe("Streaming note params (e.g. content, prompt_template_id)") },
  async ({ params }) => {
    const res = await api.createNoteStream(params);
    return { content: [{ type: "text", text: JSON.stringify({ note_id: res.noteInfo?.note_id, title: res.noteInfo?.title || res.noteInfo?.noteData?.title, tags: res.noteInfo?.tags, ai_content: res.content, event_count: res.events.length }, null, 2) }] };
  }
);

server.tool(
  "create_topic_note_stream",
  "Create a topic note with AI streaming",
  { params: z.record(z.string(), z.unknown()).describe("Streaming note params including topic_id") },
  async ({ params }) => {
    const res = await api.createTopicNoteStream(params);
    return { content: [{ type: "text", text: JSON.stringify({ note_id: res.noteInfo?.note_id, title: res.noteInfo?.title || res.noteInfo?.noteData?.title, tags: res.noteInfo?.tags, ai_content: res.content, event_count: res.events.length }, null, 2) }] };
  }
);

server.tool(
  "ai_analyze_link",
  "AI smart analysis of a URL — creates a note by analyzing the linked content (web article, social media post, etc.). Uses biji.com's AI to extract and summarize the content.",
  {
    url: z.string().describe("URL to analyze (e.g. article link, Xiaohongshu post, WeChat article)"),
    prompt_template_id: z.string().optional().describe("Prompt template ID for custom analysis style"),
    topic_id: z.string().optional().describe("Topic ID to save the note into"),
  },
  async ({ url, prompt_template_id, topic_id }) => {
    const res = await api.aiAnalyzeLink(url, { prompt_template_id, topic_id });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          note_id: res.noteInfo?.note_id,
          link_title: res.noteInfo?.link_title,
          title: res.noteInfo?.title || res.noteInfo?.noteData?.title,
          tags: res.noteInfo?.tags,
          ai_content: res.content,
          event_count: res.events.length,
        }, null, 2),
      }],
    };
  }
);

// ──────────────────── AI: Yoda Chat ────────────────────

server.tool(
  "yoda_create_chat",
  "Create a new Yoda AI chat session",
  {
    upstream: z.string().describe("Upstream source type (e.g. 'note', 'topic')"),
    res_id: z.string().optional().describe("Resource ID to associate with the chat"),
  },
  async ({ upstream, res_id }) => {
    const res = await api.createYodaChat(upstream, res_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "yoda_list_chats",
  "List Yoda AI chat history",
  {
    page_cursor: z.string().optional().describe("Pagination cursor"),
    page_size: z.number().optional().default(15),
    upstream: z.string().optional().describe("Filter by upstream type"),
  },
  async ({ page_cursor, page_size, upstream }) => {
    const res = await api.listYodaChats(page_cursor, page_size, upstream);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "yoda_get_chat_messages",
  "Get messages in a Yoda AI chat session",
  {
    session_id: z.string().describe("Chat session ID"),
    page_cursor: z.string().optional(),
    page_size: z.number().optional().default(20),
  },
  async ({ session_id, page_cursor, page_size }) => {
    const res = await api.getYodaChatMessages(session_id, page_cursor, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "yoda_chat_entry",
  "Get or create a Yoda chat session by entry point (e.g. from a note or topic)",
  {
    upstream: z.string().describe("Upstream type"),
    id: z.string().optional().describe("Entity ID"),
  },
  async ({ upstream, id }) => {
    const res = await api.getYodaChatEntry(upstream, id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "yoda_chat_stream",
  "Send a message to Yoda AI and get streaming response. Returns the complete AI response.",
  { body: z.record(z.string(), z.unknown()).describe("Chat stream params (e.g. session_id, content, message_type)") },
  async ({ body }) => {
    const res = await api.yodaChatStream(body);
    return { content: [{ type: "text", text: JSON.stringify({ ai_response: res.content, event_count: res.events.length }, null, 2) }] };
  }
);

server.tool(
  "yoda_stop_stream",
  "Stop a Yoda AI chat stream",
  {
    session_id: z.string().describe("Chat session ID"),
    message_id: z.string().describe("Message ID to stop"),
  },
  async ({ session_id, message_id }) => {
    const res = await api.stopYodaChatStream(session_id, message_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "yoda_startup_questions",
  "Get AI-suggested startup questions for Yoda chat",
  { params: z.record(z.string(), z.unknown()).optional().describe("Optional params") },
  async ({ params }) => {
    const res = await api.getYodaStartupQuestions(params || undefined);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "yoda_startup_shortcuts",
  "Get AI-suggested shortcuts for Yoda chat",
  {
    upstream: z.string().describe("Upstream type"),
    upstream_entity_id: z.string().optional().describe("Entity ID"),
  },
  async ({ upstream, upstream_entity_id }) => {
    const res = await api.getYodaStartupShortcuts(upstream, upstream_entity_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "yoda_set_chat_title",
  "Set the title for a Yoda chat session",
  {
    session_id: z.string().describe("Chat session ID"),
    title: z.string().describe("New title"),
  },
  async ({ session_id, title }) => {
    const res = await api.setYodaChatTitle(session_id, title);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "yoda_get_shared_chat",
  "Get a shared Yoda chat by share ID",
  { share_id: z.string().describe("Share ID") },
  async ({ share_id }) => {
    const res = await api.getYodaSharedChat(share_id);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("yoda_resource_config", "Get Yoda resource upload configuration", {}, async () => {
  const res = await api.getYodaResourceConfig();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

server.tool(
  "yoda_send_feedback",
  "Send feedback (thumbs up/down) for a Yoda AI message",
  {
    session_id: z.string().describe("Chat session ID"),
    message_id: z.string().describe("Message ID"),
    feedback_type: z.string().optional().default("thumbs_down").describe("Feedback type: thumbs_up or thumbs_down"),
    comment: z.string().optional().describe("Comment"),
  },
  async ({ session_id, message_id, feedback_type, comment }) => {
    const res = await api.sendYodaFeedback({ sessionId: session_id, messageId: message_id, feedbackType: feedback_type, comment });
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "yoda_create_ai_note",
  "Create a note via Yoda AI",
  { params: z.record(z.string(), z.unknown()).describe("AI note creation params") },
  async ({ params }) => {
    const res = await api.createYodaAiNote(params);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── AI: Writing ────────────────────

server.tool(
  "ai_writing_stream",
  "AI writing assistant — generate content with streaming",
  { params: z.record(z.string(), z.unknown()).describe("Writing params (e.g. prompt, style, topic)") },
  async ({ params }) => {
    const res = await api.aiWritingStream(params);
    return { content: [{ type: "text", text: JSON.stringify({ ai_content: res.content, event_count: res.events.length }, null, 2) }] };
  }
);

server.tool("list_ai_writers", "List available AI writer personas", {}, async () => {
  const res = await api.listAiWriters();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

// ──────────────────── AI: Style ────────────────────

server.tool(
  "ai_style_gen_stream",
  "Generate AI writing style with streaming",
  { params: z.record(z.string(), z.unknown()).describe("Style generation params") },
  async ({ params }) => {
    const res = await api.aiStyleGenStream(params);
    return { content: [{ type: "text", text: JSON.stringify({ ai_content: res.content, event_count: res.events.length }, null, 2) }] };
  }
);

server.tool("list_style_polishers", "List AI style polishers (for refining writing)", {}, async () => {
  const res = await api.listStylePolishers();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

server.tool("list_styles", "List all writing styles", {}, async () => {
  const res = await api.listStyles();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

server.tool(
  "create_style",
  "Create a new writing style",
  { params: z.record(z.string(), z.unknown()).describe("Style params (name, description, etc.)") },
  async ({ params }) => {
    const res = await api.createStyle(params);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "update_style",
  "Update an existing writing style",
  { params: z.record(z.string(), z.unknown()).describe("Updated style params") },
  async ({ params }) => {
    const res = await api.updateStyle(params);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "delete_style",
  "Delete a writing style",
  { params: z.record(z.string(), z.unknown()).describe("Style to delete (id)") },
  async ({ params }) => {
    const res = await api.deleteStyle(params);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── AI: Canvas ────────────────────

server.tool(
  "save_canvas",
  "Save a canvas (AI-generated visual note)",
  { params: z.record(z.string(), z.unknown()).describe("Canvas data to save") },
  async ({ params }) => {
    const res = await api.saveCanvas(params);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("get_canvas_history", "Get canvas edit history", {}, async () => {
  const res = await api.getCanvasHistory();
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

// ──────────────────── AI: Knowledge Base ────────────────────

server.tool(
  "list_knowledge_books",
  "List books in the knowledge base",
  {
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ page, page_size }) => {
    const res = await api.listKnowledgeBooks(page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool(
  "search_knowledge_books",
  "Search books in the knowledge base",
  {
    query: z.string().describe("Search keyword"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ query, page, page_size }) => {
    const res = await api.searchKnowledgeBooks(query, page, page_size);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── AI: Blogger Recognition ────────────────────

server.tool(
  "recognize_weixin_blogger",
  "AI-recognize a WeChat blogger from a URL (extracts blogger info)",
  { url: z.string().describe("WeChat article or blogger URL") },
  async ({ url }) => {
    const res = await api.recognizeWeixinBlogger(url);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// ──────────────────── Start Server ────────────────────

async function main() {
  // Auto-load auth from env vars or saved file
  if (api.loadAuth()) {
    const auth = api.getAuth();
    const now = Math.floor(Date.now() / 1000);
    if (auth.refresh_token) {
      const days = Math.floor((auth.refresh_token_expire_at - now) / 86400);
      console.error(`[startup] auth loaded (refresh_token expires in ${days} days)`);
    } else {
      console.error("[startup] token loaded (no auto-refresh)");
    }
  } else {
    console.error("[startup] no saved auth found, use set_auth or set_token to authenticate");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Get笔记 MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
