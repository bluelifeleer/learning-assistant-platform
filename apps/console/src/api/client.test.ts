import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createExport,
  createPluginToken,
  downloadExtensionPackage,
  fetchAdapters,
  fetchCourses,
  fetchNotes,
  fetchPluginStatus,
  fetchTranscripts,
  initializeSetup,
  login,
  register,
  testDatabaseConnection,
  type SetupInitializePayload,
} from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

const database = {
  database_type: "postgresql" as const,
  host: "db.example.com",
  port: 5432,
  database: "learn",
  username: "learn_user",
  password: "secret",
};

describe("setup client", () => {
  it("posts remote database config to test-database endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, database_url: "postgresql://***" }) });
    vi.stubGlobal("fetch", fetchMock);

    await testDatabaseConnection(database);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/setup/test-database",
      expect.objectContaining({ method: "POST", body: JSON.stringify(database) }),
    );
  });

  it("posts installer payload including admin and license to initialize endpoint", async () => {
    const payload: SetupInitializePayload = {
      organization_name: "Acme Training",
      admin_email: "admin@example.com",
      admin_password: "change-me",
      license_key: "LIC-123",
      database,
      initialize_schema: true,
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ installed: true, next_step: "Open console" }) });
    vi.stubGlobal("fetch", fetchMock);

    await initializeSetup(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/setup/initialize",
      expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }),
    );
  });
});

describe("plugin client", () => {
  it("creates a plugin token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "lap_test", client: { id: "1", name: "Edge", online: false } }) });
    vi.stubGlobal("fetch", fetchMock);

    await createPluginToken("Edge");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/plugin-tokens",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Edge" }) }),
    );
  });

  it("fetches plugin status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clients: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPluginStatus();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/plugin-status");
  });

  it("downloads the packaged extension zip", async () => {
    const blob = new Blob(["zip"]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);

    await downloadExtensionPackage();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/plugin-package");
  });
});

describe("auth client", () => {
  it("registers and logs in users", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "la_test", user: { email: "user@example.com" } }) });
    vi.stubGlobal("fetch", fetchMock);

    await register({ email: "user@example.com", password: "secret123", display_name: "User One" });
    await login({ email: "user@example.com", password: "secret123" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/auth/register",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:17890/api/v1/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("workspace client", () => {
  it("fetches dashboard resources", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCourses();
    await fetchTranscripts();
    await fetchNotes();
    await fetchAdapters();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/courses");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/transcripts");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/notes");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/adapters");
  });

  it("creates export tasks with the session token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "exp", status: "queued", format: "markdown" }) });
    vi.stubGlobal("fetch", fetchMock);

    await createExport({ course_id: "course-1", format: "markdown" }, "la_session");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/exports",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
  });
});
