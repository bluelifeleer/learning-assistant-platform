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

export async function fetchApiStatus(): Promise<ApiStatus> {
  const response = await fetch("http://127.0.0.1:17890/api/v1/health");
  if (!response.ok) throw new Error(`API status failed: ${response.status}`);
  return response.json() as Promise<ApiStatus>;
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const response = await fetch("http://127.0.0.1:17890/api/v1/setup/status");
  if (!response.ok) throw new Error(`Setup status failed: ${response.status}`);
  return response.json() as Promise<SetupStatus>;
}
