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

export const API_BASE_URL = "http://127.0.0.1:17890/api/v1";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
