export type JobStatus = "pending" | "running" | "done" | "failed" | "canceled";
export type JobKind = "link" | "upload";

export interface LinkPayload {
  url: string;
  prompt?: string;
  topic_alias?: string;
}

export interface UploadPayload {
  file: string;
  prompt?: string;
  topic_alias?: string;
  kind?: "audio" | "video";
  duration_ms?: number;
}

export type JobPayload = LinkPayload | UploadPayload;

export interface JobResult {
  note_id?: string;
  title?: string;
  link_title?: string;
  content_length?: number;
  oss_url?: string;
  file_id?: string;
}

export interface Job {
  id: string;
  kind: JobKind;
  payload: JobPayload;
  status: JobStatus;
  attempt: number;
  max_attempts: number;
  result?: JobResult;
  error?: string;
  batch_id?: string;
  created_at: number;
  started_at?: number;
  finished_at?: number;
}
