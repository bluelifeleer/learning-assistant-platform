export const FETCH_SUBTITLE_FILE_MESSAGE = "learning-assistant:fetch-subtitle-file";

export interface SubtitleFetchRequest {
  type: typeof FETCH_SUBTITLE_FILE_MESSAGE;
  url: string;
}

export type SubtitleFetchResponse =
  | { ok: true; text: string }
  | { ok: false; error: string };

interface SubtitleFetchDependencies {
  fetch: typeof fetch;
}

export function isSubtitleFetchRequest(message: unknown): message is SubtitleFetchRequest {
  return Boolean(
    message
    && typeof message === "object"
    && (message as { type?: unknown }).type === FETCH_SUBTITLE_FILE_MESSAGE
    && typeof (message as { url?: unknown }).url === "string",
  );
}

export async function handleSubtitleFetchMessage(
  message: unknown,
  dependencies: SubtitleFetchDependencies = { fetch },
): Promise<SubtitleFetchResponse> {
  if (!isSubtitleFetchRequest(message)) {
    return { ok: false, error: "Unsupported subtitle fetch message" };
  }

  try {
    const response = await dependencies.fetch(message.url, { credentials: "include" });
    if (!response.ok) {
      return { ok: false, error: `Subtitle request failed: ${response.status}` };
    }
    return { ok: true, text: await response.text() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Subtitle request failed" };
  }
}
