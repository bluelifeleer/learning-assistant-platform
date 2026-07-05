import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeSetup, testDatabaseConnection, type SetupInitializePayload } from "./client";

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
