import {
  FETCH_SUBTITLE_FILE_MESSAGE,
  type SubtitleFetchResponse,
} from "./backgroundSubtitleFetch";

interface RuntimeLike {
  sendMessage(message: unknown, callback: (response: unknown) => void): void;
  lastError?: { message?: string };
}

interface SubtitleFetchClientDependencies {
  runtime?: RuntimeLike;
  fetch: typeof fetch;
}

function isSuccessfulResponse(response: unknown): response is Extract<SubtitleFetchResponse, { ok: true }> {
  return Boolean(response && typeof response === "object" && (response as { ok?: unknown }).ok === true);
}

function fetchViaBackground(url: string, runtime: RuntimeLike): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      runtime.sendMessage({ type: FETCH_SUBTITLE_FILE_MESSAGE, url }, (response: unknown) => {
        if (runtime.lastError || !isSuccessfulResponse(response)) {
          resolve(null);
          return;
        }
        resolve(response.text);
      });
    } catch {
      resolve(null);
    }
  });
}

async function fetchDirectly(url: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Subtitle request failed: ${response.status}`);
  }
  return response.text();
}

export async function fetchSubtitleFileText(
  url: string,
  dependencies: SubtitleFetchClientDependencies = { runtime: chrome.runtime, fetch },
): Promise<string> {
  if (dependencies.runtime) {
    const text = await fetchViaBackground(url, dependencies.runtime);
    if (text !== null) return text;
  }

  return fetchDirectly(url, dependencies.fetch);
}
