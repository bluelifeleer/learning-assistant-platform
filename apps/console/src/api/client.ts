export interface ApiStatus {
  status: string;
  service: string;
  version: string;
}

export async function fetchApiStatus(): Promise<ApiStatus> {
  const response = await fetch("http://127.0.0.1:17890/api/v1/health");
  if (!response.ok) throw new Error(`API status failed: ${response.status}`);
  return response.json() as Promise<ApiStatus>;
}
