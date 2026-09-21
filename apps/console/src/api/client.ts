export interface ApiStatus {
  status: string;
  service: string;
  version: string;
}

export interface SetupStatus {
  installed: boolean;
  env_exists?: boolean;
  database_configured?: boolean;
  database_connected?: boolean;
  schema_initialized?: boolean;
  database_type?: string | null;
  next_step: string;
  error?: string | null;
}

export type DatabaseType = "postgresql" | "mysql";

export interface DatabaseConfigPayload {
  database_type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface DatabaseTestResult {
  ok: boolean;
  database_url: string;
  error?: string | null;
}

export interface SetupInitializePayload {
  organization_name: string;
  admin_email: string;
  admin_password: string;
  license_key?: string;
  database: DatabaseConfigPayload;
  initialize_schema: boolean;
}

export interface PluginClientStatus {
  id: string;
  name: string;
  online: boolean;
  extension_version?: string | null;
  current_url?: string | null;
  adapter_id?: string | null;
  adapter_name?: string | null;
  enabled_adapters: string[];
  last_seen_at?: string | null;
}

export interface PluginTokenResponse {
  token: string;
  client: PluginClientStatus;
}

export interface PluginStatusResponse {
  clients: PluginClientStatus[];
}

export interface UserProfile {
  id: string;
  username?: string | null;
  email: string;
  display_name: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface RegisterPayload {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginPayload {
  account: string;
  password: string;
}

export interface UserUpdatePayload {
  username?: string | null;
  display_name?: string | null;
}

export interface CourseItem {
  id: string;
  title: string;
  term?: string | null;
  site_name: string;
  adapter_id: string;
  chapter_count: number;
  transcript_count: number;
  note_count: number;
  updated_at?: string | null;
}

export interface TranscriptItem {
  id: string;
  course_id: string;
  course_title: string;
  chapter_id: string;
  chapter_title: string;
  start_seconds?: number | null;
  end_seconds?: number | null;
  text: string;
  source: string;
  created_at?: string | null;
}

export interface VideoEventItem {
  id: string;
  session_id: string;
  event_type: string;
  video_time_seconds?: number | null;
  course_url?: string | null;
  external_course_id?: string | null;
  external_chapter_id?: string | null;
  video_source: Record<string, unknown>;
  payload: Record<string, unknown>;
  created_at?: string | null;
}

export interface VideoEventQuery {
  eventType?: string;
  sessionId?: string;
}

export interface NoteItem {
  id: string;
  course_id: string;
  course_title: string;
  chapter_id?: string | null;
  chapter_title?: string | null;
  video_time_seconds?: number | null;
  content: string;
  corrected_content?: string | null;
  tags?: string[];
  created_at?: string | null;
}

export interface NoteCreatePayload {
  course_id: string;
  chapter_id?: string | null;
  video_time_seconds?: number | null;
  content: string;
  tags?: string[];
}

export interface AdapterItem {
  id: string;
  adapter_id: string;
  name: string;
  status: string;
  host_patterns: Record<string, unknown>;
}

export interface AdapterSavePayload {
  adapter_id: string;
  name: string;
  status: string;
  host_patterns: Record<string, unknown>;
}

export interface ExportItem {
  id: string;
  course_id?: string | null;
  course_title?: string | null;
  format: string;
  status: string;
  file_path?: string | null;
  created_at?: string | null;
}

export interface ExportCreatePayload {
  course_id?: string | null;
  export_format: "markdown" | "json" | "anki";
}

export interface WorkspaceSettings {
  organization_name: string;
  plan: string;
  license_key?: string | null;
  license_status: string;
  api_base_url: string;
  database_type?: string | null;
  export_dir: string;
}

export interface WorkspaceSettingsUpdatePayload {
  organization_name?: string;
  license_key?: string;
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:17890/api/v1";

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || DEFAULT_API_BASE_URL;

export class ApiError extends Error {
  status: number;

  constructor(path: string, status: number) {
    super(`${path} failed: ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

let sessionToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function resolveToken(explicitToken?: string): string | undefined {
  return explicitToken ?? sessionToken ?? undefined;
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function checkResponse(response: Response, path: string): void {
  if (response.status === 401) unauthorizedHandler?.();
  if (!response.ok) throw new ApiError(path, response.status);
}

async function postJson<T>(path: string, body: unknown, token?: string, method = "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    signal,
    headers: { "content-type": "application/json", ...authHeaders(resolveToken(token)) },
    body: JSON.stringify(body),
  });
  checkResponse(response, path);
  return response.json() as Promise<T>;
}

async function deleteResource(path: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(resolveToken(token)),
  });
  checkResponse(response, path);
}

async function getJson<T>(path: string, token?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal,
    headers: authHeaders(resolveToken(token)),
  });
  checkResponse(response, path);
  return response.json() as Promise<T>;
}

async function getBlob(path: string, token?: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: authHeaders(resolveToken(token)),
  });
  checkResponse(response, path);
  return response.blob();
}

export async function fetchApiStatus(): Promise<ApiStatus> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new ApiError("/health", response.status);
  return response.json() as Promise<ApiStatus>;
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const response = await fetch(`${API_BASE_URL}/setup/status`);
  if (!response.ok) throw new ApiError("/setup/status", response.status);
  return response.json() as Promise<SetupStatus>;
}

export async function testDatabaseConnection(payload: DatabaseConfigPayload): Promise<DatabaseTestResult> {
  return postJson<DatabaseTestResult>("/setup/test-database", payload);
}

export async function initializeSetup(payload: SetupInitializePayload): Promise<SetupStatus> {
  return postJson<SetupStatus>("/setup/initialize", payload);
}

export async function createPluginToken(name: string, token?: string): Promise<PluginTokenResponse> {
  return postJson<PluginTokenResponse>("/plugin-tokens", { name }, token);
}

export async function fetchPluginStatus(signal?: AbortSignal): Promise<PluginStatusResponse> {
  return getJson<PluginStatusResponse>("/plugin-status", undefined, signal);
}

export async function downloadExtensionPackage(token?: string): Promise<Blob> {
  return getBlob("/plugin-package", token);
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  return postJson<AuthResponse>("/auth/register", payload);
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return postJson<AuthResponse>("/auth/login", payload);
}

export async function fetchMe(token: string): Promise<UserProfile> {
  return getJson<UserProfile>("/auth/me", token);
}

export async function updateMe(payload: UserUpdatePayload, token: string): Promise<UserProfile> {
  return postJson<UserProfile>("/auth/me", payload, token, "PUT");
}

export async function fetchCourses(token?: string): Promise<{ items: CourseItem[] }> {
  return getJson<{ items: CourseItem[] }>("/courses", token);
}

export interface CourseChapterNote {
  id: string;
  video_time_seconds?: number | null;
  content: string;
  corrected_content?: string | null;
  tags?: string[];
  created_at?: string | null;
}

export interface CourseChapterTranscript {
  id: string;
  start_seconds?: number | null;
  end_seconds?: number | null;
  text: string;
  source: string;
}

export interface CourseChapterNode {
  id: string;
  title: string;
  sort_order: number;
  duration_seconds?: number | null;
  children: CourseChapterNode[];
  transcripts: CourseChapterTranscript[];
  notes: CourseChapterNote[];
}

export interface CourseDetail {
  id: string;
  title: string;
  term?: string | null;
  chapters: CourseChapterNode[];
}

export async function updateScreenshotImage(screenshotId: string, imageBase64: string, token?: string): Promise<void> {
  return postJson(`/screenshots/${screenshotId}/image`, { image_base64: imageBase64 }, token, "PUT");
}

export async function deleteScreenshot(screenshotId: string, token?: string): Promise<void> {
  return deleteResource(`/screenshots/${screenshotId}`, token);
}

export async function fetchCourseDetail(id: string, token?: string): Promise<CourseDetail> {
  return getJson<CourseDetail>(`/courses/${id}/detail`, token);
}

export interface CourseVideoSourceItem {
  chapter_id?: string | null;
  chapter_title?: string | null;
  course_url?: string | null;
  video_source: {
    current_src?: string | null;
    source_urls: string[];
    poster_url?: string | null;
    is_blob: boolean;
    is_likely_signed: boolean;
    media_type: string;
  };
  captured_at?: string | null;
}

export async function fetchCourseVideoSources(courseId: string, token?: string): Promise<{ items: CourseVideoSourceItem[] }> {
  return getJson<{ items: CourseVideoSourceItem[] }>(`/courses/${courseId}/video-sources`, token);
}

export interface SearchNoteHit {
  id: string;
  course_id: string;
  course_title: string;
  chapter_id?: string | null;
  chapter_title?: string | null;
  video_time_seconds?: number | null;
  content: string;
  corrected_content?: string | null;
  tags?: string[];
  created_at?: string | null;
}

export interface SearchTranscriptHit {
  id: string;
  course_id: string;
  course_title: string;
  chapter_id: string;
  chapter_title: string;
  start_seconds?: number | null;
  end_seconds?: number | null;
  text: string;
  source: string;
}

export interface SearchResult {
  notes: SearchNoteHit[];
  transcripts: SearchTranscriptHit[];
}

export async function searchContent(query: string, token?: string): Promise<SearchResult> {
  return getJson<SearchResult>(`/search?q=${encodeURIComponent(query)}`, token);
}

export interface DailyActivity {
  date: string;
  notes: number;
  play_events: number;
}

export interface StatsSummary {
  courses: number;
  notes: number;
  transcripts: number;
  play_events: number;
  daily: DailyActivity[];
}

export async function fetchStatsSummary(token?: string): Promise<StatsSummary> {
  return getJson<StatsSummary>("/stats/summary", token);
}

export interface ReviewCard {
  id: string;
  note_id?: string | null;
  course_id?: string | null;
  chapter_id?: string | null;
  front: string;
  back: string;
  due_at?: string | null;
  review_count: number;
}

export type ReviewAnswerResult = "good" | "again";

export async function createReviewCard(noteId: string, token?: string): Promise<ReviewCard> {
  return postJson<ReviewCard>("/review/cards", { note_id: noteId }, token);
}

export async function fetchDueCards(token?: string): Promise<{ items: ReviewCard[] }> {
  return getJson<{ items: ReviewCard[] }>("/review/due", token);
}

export async function fetchReviewCards(token?: string): Promise<{ items: ReviewCard[] }> {
  return getJson<{ items: ReviewCard[] }>("/review/cards", token);
}

export async function answerReviewCard(id: string, result: ReviewAnswerResult, token?: string): Promise<ReviewCard> {
  return postJson<ReviewCard>(`/review/cards/${id}/answer`, { result }, token);
}

export async function fetchTranscripts(token?: string): Promise<{ items: TranscriptItem[] }> {
  return getJson<{ items: TranscriptItem[] }>("/transcripts", token);
}

export async function fetchVideoEvents(query: VideoEventQuery = {}, signal?: AbortSignal, token?: string): Promise<{ items: VideoEventItem[] }> {
  const params = new URLSearchParams();
  if (query.eventType) params.set("event_type", query.eventType);
  if (query.sessionId) params.set("session_id", query.sessionId);
  const suffix = params.toString();
  return getJson<{ items: VideoEventItem[] }>(`/video-events${suffix ? `?${suffix}` : ""}`, token, signal);
}

export async function fetchNotes(token?: string): Promise<{ items: NoteItem[] }> {
  return getJson<{ items: NoteItem[] }>("/notes", token);
}

export async function createNote(payload: NoteCreatePayload, token?: string): Promise<NoteItem> {
  return postJson<NoteItem>("/notes", payload, token);
}

export async function saveNoteCorrection(noteId: string, correctedContent: string | null, token?: string): Promise<NoteItem> {
  return postJson<NoteItem>(`/notes/${noteId}/correction`, { corrected_content: correctedContent }, token, "PATCH");
}

export async function saveNoteTags(noteId: string, tags: string[], token?: string): Promise<NoteItem> {
  return postJson<NoteItem>(`/notes/${noteId}/tags`, { tags }, token, "PATCH");
}

export async function createCourse(title: string, token?: string): Promise<CourseItem> {
  return postJson<CourseItem>("/courses", { title }, token);
}

export interface NoteImageUploadResponse {
  id: string;
}

export async function uploadNoteImage(imageBase64: string, token?: string): Promise<NoteImageUploadResponse> {
  return postJson<NoteImageUploadResponse>("/notes/images", { image_base64: imageBase64 }, token);
}

export async function fetchNoteImageUrl(id: string, token?: string): Promise<string> {
  const blob = await getBlob(`/notes/images/${id}/image`, token);
  return URL.createObjectURL(blob);
}

export async function fetchAdapters(token?: string): Promise<{ items: AdapterItem[] }> {
  return getJson<{ items: AdapterItem[] }>("/adapters", token);
}

export async function saveAdapter(payload: AdapterSavePayload, token?: string): Promise<AdapterItem> {
  return postJson<AdapterItem>("/adapters", payload, token);
}

export async function fetchSettings(token?: string): Promise<WorkspaceSettings> {
  return getJson<WorkspaceSettings>("/settings", token);
}

export async function updateSettings(payload: WorkspaceSettingsUpdatePayload, token?: string): Promise<WorkspaceSettings> {
  return postJson<WorkspaceSettings>("/settings", payload, token, "PUT");
}

export async function fetchExports(token?: string): Promise<{ items: ExportItem[] }> {
  return getJson<{ items: ExportItem[] }>("/exports", token);
}

export async function createExport(payload: ExportCreatePayload, token?: string): Promise<{ id: string; status: string; format: string }> {
  return postJson<{ id: string; status: string; format: string }>("/exports", payload, token);
}

export async function downloadExport(id: string, token?: string): Promise<Blob> {
  return getBlob(`/exports/${id}/download`, token);
}

export interface ScreenshotItem {
  id: string;
  course_id: string;
  course_title: string;
  chapter_id: string;
  chapter_title: string;
  video_time_seconds?: number | null;
  created_at?: string | null;
}

export async function fetchScreenshots(courseId?: string, chapterId?: string, token?: string): Promise<{ items: ScreenshotItem[] }> {
  const params = new URLSearchParams();
  if (courseId) params.set("course_id", courseId);
  if (chapterId) params.set("chapter_id", chapterId);
  const suffix = params.toString();
  return getJson<{ items: ScreenshotItem[] }>(`/screenshots${suffix ? `?${suffix}` : ""}`, token);
}

export async function fetchScreenshotImageUrl(id: string, token?: string): Promise<string> {
  const blob = await getBlob(`/screenshots/${id}/image`, token);
  return URL.createObjectURL(blob);
}
