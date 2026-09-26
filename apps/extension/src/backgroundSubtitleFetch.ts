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

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (含云元数据)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0) return true; // 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIpv6(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a === "::" || a === "::1") return true;
  if (a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb")) return true; // fe80::/10 link-local
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // fc00::/7 ULA
  if (a.startsWith("::ffff:")) {
    const v4 = a.slice("::ffff:".length);
    const parts = v4.split(".").map(Number);
    if (parts.length === 4 && parts.every((n) => !Number.isNaN(n) && n >= 0 && n <= 255)) {
      return isPrivateIpv4(parts);
    }
  }
  return false;
}

function isForbiddenHostname(host: string): boolean {
  const lower = host.toLowerCase().replace(/^\[|\]$/g, ""); // 去掉 IPv6 方括号
  if (!lower) return true;
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) {
    const parts = lower.split(".").map(Number);
    if (parts.every((n) => n >= 0 && n <= 255)) {
      return isPrivateIpv4(parts);
    }
    return true; // 非法的 IPv4 字面量
  }
  if (lower.includes(":")) {
    return isPrivateIpv6(lower);
  }
  return false;
}

export function isAllowedSubtitleFetchUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }
    return !isForbiddenHostname(url.hostname);
  } catch {
    return false;
  }
}

export async function handleSubtitleFetchMessage(
  message: unknown,
  dependencies: SubtitleFetchDependencies = { fetch },
): Promise<SubtitleFetchResponse> {
  if (!isSubtitleFetchRequest(message)) {
    return { ok: false, error: "Unsupported subtitle fetch message" };
  }

  if (!isAllowedSubtitleFetchUrl(message.url)) {
    return { ok: false, error: "Unsupported subtitle URL: only public http(s) URLs are allowed" };
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
