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

export type ExportFormat = "markdown" | "json" | "anki" | "report_pdf";

export interface ExportCreatePayload {
  course_id?: string | null;
  export_format: ExportFormat;
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

export async function changePassword(currentPassword: string, newPassword: string, token?: string): Promise<void> {
  await postJson("/auth/change-password", { current_password: currentPassword, new_password: newPassword }, token);
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

export interface AISettings {
  llm_base_url: string | null;
  llm_model: string | null;
  api_key_masked: string | null;
  configured: boolean;
  ai_auto_generate: boolean;
}

export interface AISettingsUpdatePayload {
  llm_base_url?: string;
  llm_model?: string;
  llm_api_key?: string;
  ai_auto_generate?: boolean;
}

export interface AITestResult {
  ok: boolean;
  detail?: string | null;
}

export type AITaskType = "chapter_summary" | "course_summary" | "quiz" | "flashcards" | "email_digest";

export type AITaskStatus = "pending" | "running" | "done" | "failed";

export interface AITaskCreateResponse {
  task_id: string;
  status: "pending" | "running";
}

export interface AITask {
  id: string;
  task_type: AITaskType;
  status: AITaskStatus;
  result_count: number;
  error?: string | null;
}

export interface AISummaryOutlineItem {
  title: string;
  start_mmss: string;
}

export type AISummaryStatus = "none" | "pending" | "running" | "done" | "failed";

export interface AISummary {
  status: AISummaryStatus;
  summary_md?: string;
  outline?: AISummaryOutlineItem[];
  key_points?: string[];
  error?: string | null;
  updated_at?: string;
}

export interface QuizQuestion {
  id: string;
  course_id: string;
  chapter_id: string;
  question_type: "choice" | "truefalse";
  question: string;
  options: string[];
  answer: string;
  explanation?: string | null;
}

export interface QuizGeneratePayload {
  chapter_id: string;
  count?: number;
  types?: string[];
}

export interface FlashcardsGeneratePayload {
  chapter_id: string;
  count?: number;
}

export async function fetchAiSettings(token?: string): Promise<AISettings> {
  return getJson<AISettings>("/ai/settings", token);
}

export async function updateAiSettings(payload: AISettingsUpdatePayload, token?: string): Promise<AISettings> {
  return postJson<AISettings>("/ai/settings", payload, token, "PUT");
}

export async function testAiConnection(token?: string): Promise<AITestResult> {
  return postJson<AITestResult>("/ai/settings/test", {}, token);
}

export async function requestChapterSummary(chapterId: string, token?: string): Promise<AITaskCreateResponse> {
  return postJson<AITaskCreateResponse>(`/ai/summary/chapter/${chapterId}`, {}, token);
}

export async function requestCourseSummary(courseId: string, token?: string): Promise<AITaskCreateResponse> {
  return postJson<AITaskCreateResponse>(`/ai/summary/course/${courseId}`, {}, token);
}

export async function fetchChapterSummary(chapterId: string, token?: string): Promise<AISummary> {
  return getJson<AISummary>(`/ai/summary/chapter/${chapterId}`, token);
}

export async function fetchCourseSummary(courseId: string, token?: string): Promise<AISummary> {
  return getJson<AISummary>(`/ai/summary/course/${courseId}`, token);
}

export async function requestQuiz(payload: QuizGeneratePayload, token?: string): Promise<AITaskCreateResponse> {
  return postJson<AITaskCreateResponse>("/ai/quiz", payload, token);
}

export async function fetchQuizQuestions(chapterId: string, token?: string): Promise<{ items: QuizQuestion[] }> {
  return getJson<{ items: QuizQuestion[] }>(`/ai/quiz?chapter_id=${encodeURIComponent(chapterId)}`, token);
}

export async function requestFlashcards(payload: FlashcardsGeneratePayload, token?: string): Promise<AITaskCreateResponse> {
  return postJson<AITaskCreateResponse>("/ai/flashcards", payload, token);
}

export async function fetchAiTask(taskId: string, token?: string): Promise<AITask> {
  return getJson<AITask>(`/ai/tasks/${taskId}`, token);
}

export interface AskCitation {
  chapter_id: string;
  chapter_title: string;
  start_seconds: number | null;
  excerpt: string;
}

export interface AskHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskPayload {
  course_id: string;
  chapter_id: string | null;
  question: string;
  history?: AskHistoryMessage[];
}

export interface AskAnswer {
  answer_md: string;
  citations: AskCitation[];
}

export async function askCourseQuestion(payload: AskPayload, token?: string): Promise<AskAnswer> {
  return postJson<AskAnswer>("/ai/ask", payload, token);
}

export interface QuizAttemptItem {
  question_id: string;
  chosen: string;
  correct: boolean;
}

export interface QuizAttemptsResponse {
  recorded: number;
}

export async function submitQuizAttempts(items: QuizAttemptItem[], token?: string): Promise<QuizAttemptsResponse> {
  return postJson<QuizAttemptsResponse>("/quiz/attempts", { items }, token);
}

export interface MasteryItem {
  course_id: string;
  course_title: string;
  chapter_id: string;
  chapter_title: string;
  total: number;
  correct: number;
  accuracy: number;
  last_attempt_at: string | null;
}

export async function fetchMastery(courseId?: string, token?: string): Promise<{ items: MasteryItem[] }> {
  const suffix = courseId ? `?course_id=${encodeURIComponent(courseId)}` : "";
  return getJson<{ items: MasteryItem[] }>(`/stats/mastery${suffix}`, token);
}

export type DigestFrequency = "daily" | "weekly";

export interface EmailSettings {
  smtp_host: string | null;
  smtp_port: number;
  smtp_username: string | null;
  password_masked: string | null;
  email_from: string | null;
  email_to: string | null;
  configured: boolean;
  digest_auto: boolean;
  digest_frequency: DigestFrequency;
  digest_hour: number;
  last_digest_at: string | null;
}

export interface EmailSettingsUpdatePayload {
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  email_from?: string;
  email_to?: string;
  digest_auto?: boolean;
  digest_frequency?: DigestFrequency;
  digest_hour?: number;
}

export interface EmailSendResult {
  ok: boolean;
  detail: string | null;
}

export async function fetchEmailSettings(token?: string): Promise<EmailSettings> {
  return getJson<EmailSettings>("/email/settings", token);
}

export async function updateEmailSettings(payload: EmailSettingsUpdatePayload, token?: string): Promise<EmailSettings> {
  return postJson<EmailSettings>("/email/settings", payload, token, "PUT");
}

export async function testEmailSettings(token?: string): Promise<EmailSendResult> {
  return postJson<EmailSendResult>("/email/settings/test", {}, token);
}

export async function sendNoteEmail(noteId: string, token?: string): Promise<EmailSendResult> {
  return postJson<EmailSendResult>(`/email/notes/${encodeURIComponent(noteId)}/send`, {}, token);
}

export async function sendDigestEmail(token?: string): Promise<AITaskCreateResponse> {
  return postJson<AITaskCreateResponse>("/email/digest/send", {}, token);
}
