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
  email: string;
  password: string;
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

export interface NoteItem {
  id: string;
  course_id: string;
  course_title: string;
  chapter_id?: string | null;
  chapter_title?: string | null;
  video_time_seconds?: number | null;
  content: string;
  created_at?: string | null;
}

export interface AdapterItem {
  id: string;
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
  format: "markdown" | "json";
}

export const API_BASE_URL = "http://127.0.0.1:17890/api/v1";

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function getJson<T>(path: string, token?: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const response = token ? await fetch(url, { headers: { authorization: `Bearer ${token}` } }) : await fetch(url);
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchApiStatus(): Promise<ApiStatus> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new Error(`API status failed: ${response.status}`);
  return response.json() as Promise<ApiStatus>;
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const response = await fetch(`${API_BASE_URL}/setup/status`);
  if (!response.ok) throw new Error(`Setup status failed: ${response.status}`);
  return response.json() as Promise<SetupStatus>;
}

export async function testDatabaseConnection(payload: DatabaseConfigPayload): Promise<DatabaseTestResult> {
  return postJson<DatabaseTestResult>("/setup/test-database", payload);
}

export async function initializeSetup(payload: SetupInitializePayload): Promise<SetupStatus> {
  return postJson<SetupStatus>("/setup/initialize", payload);
}

export async function createPluginToken(name: string): Promise<PluginTokenResponse> {
  return postJson<PluginTokenResponse>("/plugin-tokens", { name });
}

export async function fetchPluginStatus(): Promise<PluginStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/plugin-status`);
  if (!response.ok) throw new Error(`Plugin status failed: ${response.status}`);
  return response.json() as Promise<PluginStatusResponse>;
}

export async function downloadExtensionPackage(): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/plugin-package`);
  if (!response.ok) throw new Error(`Plugin package failed: ${response.status}`);
  return response.blob();
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

export async function fetchCourses(): Promise<{ items: CourseItem[] }> {
  return getJson<{ items: CourseItem[] }>("/courses");
}

export async function fetchTranscripts(): Promise<{ items: TranscriptItem[] }> {
  return getJson<{ items: TranscriptItem[] }>("/transcripts");
}

export async function fetchNotes(): Promise<{ items: NoteItem[] }> {
  return getJson<{ items: NoteItem[] }>("/notes");
}

export async function fetchAdapters(): Promise<{ items: AdapterItem[] }> {
  return getJson<{ items: AdapterItem[] }>("/adapters");
}

export async function fetchExports(): Promise<{ items: ExportItem[] }> {
  return getJson<{ items: ExportItem[] }>("/exports");
}

export async function createExport(payload: ExportCreatePayload, token: string): Promise<{ id: string; status: string; format: string }> {
  return postJson<{ id: string; status: string; format: string }>("/exports", payload, token);
}
