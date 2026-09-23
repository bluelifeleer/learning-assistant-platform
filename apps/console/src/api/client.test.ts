import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  answerReviewCard,
  askCourseQuestion,
  createExport,
  createPluginToken,
  createReviewCard,
  downloadExport,
  downloadExtensionPackage,
  fetchAdapters,
  fetchAiSettings,
  fetchAiTask,
  fetchChapterSummary,
  fetchCourseDetail,
  fetchCourseSummary,
  fetchCourses,
  fetchDueCards,
  fetchEmailSettings,
  fetchMastery,
  fetchNotes,
  fetchPluginStatus,
  fetchQuizQuestions,
  fetchReviewCards,
  fetchScreenshots,
  fetchScreenshotImageUrl,
  fetchStatsSummary,
  fetchVideoEvents,
  fetchSettings,
  fetchTranscripts,
  initializeSetup,
  login,
  register,
  requestChapterSummary,
  requestCourseSummary,
  requestFlashcards,
  requestQuiz,
  saveAdapter,
  searchContent,
  sendDigestEmail,
  sendNoteEmail,
  setSessionToken,
  setUnauthorizedHandler,
  submitQuizAttempts,
  testAiConnection,
  testEmailSettings,
  updateAiSettings,
  updateEmailSettings,
  updateSettings,
  testDatabaseConnection,
  updateMe,
  uploadNoteImage,
  type SetupInitializePayload,
} from "./client";

afterEach(() => {
  setSessionToken(null);
  setUnauthorizedHandler(null);
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

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/plugin-status", expect.anything());
  });

  it("downloads the packaged extension zip", async () => {
    const blob = new Blob(["zip"]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);

    await downloadExtensionPackage();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/plugin-package", expect.anything());
  });
});

describe("auth client", () => {
  it("registers and logs in users", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "la_test", user: { email: "user@example.com" } }) });
    vi.stubGlobal("fetch", fetchMock);

    await register({ email: "user@example.com", password: "secret123", display_name: "User One" });
    await login({ account: "userone", password: "secret123" });
    await updateMe({ username: "userone", display_name: "User One" }, "la_session");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/auth/register",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "user@example.com", password: "secret123", display_name: "User One" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:17890/api/v1/auth/login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ account: "userone", password: "secret123" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:17890/api/v1/auth/me",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ username: "userone", display_name: "User One" }),
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
  });
});

describe("workspace client", () => {
  it("fetches dashboard resources", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCourses();
    await fetchTranscripts();
    await fetchVideoEvents();
    await fetchVideoEvents({ eventType: "subtitle-diagnostic" });
    await fetchNotes();
    await fetchAdapters();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/courses", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/transcripts", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/video-events", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/video-events?event_type=subtitle-diagnostic", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/notes", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/adapters", expect.anything());
  });

  it("uploads note images as base64 json with the bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "img-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadNoteImage("data:image/png;base64,QUJD", "la_session");

    expect(result).toEqual({ id: "img-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/notes/images",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ image_base64: "data:image/png;base64,QUJD" }),
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
  });

  it("saves adapters and workspace settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1", adapter_id: "generic-video" }) });
    vi.stubGlobal("fetch", fetchMock);

    await saveAdapter({ adapter_id: "generic-video", name: "Generic Video", status: "enabled", host_patterns: { hosts: ["example.com"] } });
    await fetchSettings();
    await updateSettings({ organization_name: "Commercial Workspace", license_key: "LIC-456" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/adapters",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:17890/api/v1/settings", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:17890/api/v1/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ organization_name: "Commercial Workspace", license_key: "LIC-456" }) }),
    );
  });

  it("creates export tasks with the session token and export_format field", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "exp", status: "queued", format: "markdown" }) });
    vi.stubGlobal("fetch", fetchMock);

    await createExport({ course_id: "course-1", export_format: "markdown" }, "la_session");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/exports",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ course_id: "course-1", export_format: "markdown" }),
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
  });

  it("downloads completed exports with the session token", async () => {
    const blob = new Blob(["markdown"]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);

    await downloadExport("exp-1", "la_session");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/exports/exp-1/download",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
  });
});

describe("learning client", () => {
  it("fetches the course detail tree", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "course-1", chapters: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCourseDetail("course-1", "la_session");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/courses/course-1/detail",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
  });

  it("searches notes and transcripts with an encoded query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notes: [], transcripts: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await searchContent("递归 算法");

    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:17890/api/v1/search?q=${encodeURIComponent("递归 算法")}`,
      expect.anything(),
    );
  });

  it("fetches the stats summary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ courses: 1, notes: 2, transcripts: 3, play_events: 4, daily: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchStatsSummary();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:17890/api/v1/stats/summary", expect.anything());
  });

  it("creates and lists review cards", async () => {
    const card = { id: "card-1", front: "f", back: "b", due_at: null, review_count: 0 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => card });
    vi.stubGlobal("fetch", fetchMock);

    await createReviewCard("note-1", "la_session");
    await fetchReviewCards();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/review/cards",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ note_id: "note-1" }),
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:17890/api/v1/review/cards", expect.anything());
  });

  it("fetches due cards and submits an answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchDueCards("la_session");
    await answerReviewCard("card-1", "again", "la_session");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/review/due",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:17890/api/v1/review/cards/card-1/answer",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ result: "again" }),
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
  });

  it("fetches screenshots with optional course and chapter filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchScreenshots("course-1", "chapter-2", "la_session");
    await fetchScreenshots();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/screenshots?course_id=course-1&chapter_id=chapter-2",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:17890/api/v1/screenshots",
      expect.anything(),
    );
  });

  it("fetches screenshot images as authorized blobs and returns object URLs", async () => {
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn().mockReturnValue("blob:shot-1");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createObjectURL });

    try {
      const url = await fetchScreenshotImageUrl("shot-1", "la_session");

      expect(url).toBe("blob:shot-1");
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:17890/api/v1/screenshots/shot-1/image",
        expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
      );
    } finally {
      delete (URL as unknown as Record<string, unknown>).createObjectURL;
    }
  });
});

describe("ai client", () => {
  it("reads and updates ai settings with PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ llm_base_url: null, llm_model: null, api_key_masked: null, configured: false, ai_auto_generate: false }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchAiSettings("la_session");
    await updateAiSettings({ llm_base_url: "https://api.deepseek.com/v1", llm_model: "deepseek-chat", llm_api_key: "sk-test", ai_auto_generate: true }, "la_session");
    await updateAiSettings({ llm_api_key: "" }, "la_session");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/ai/settings",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:17890/api/v1/ai/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ llm_base_url: "https://api.deepseek.com/v1", llm_model: "deepseek-chat", llm_api_key: "sk-test", ai_auto_generate: true }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:17890/api/v1/ai/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ llm_api_key: "" }) }),
    );
  });

  it("posts to the ai connection test endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await testAiConnection("la_session");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/ai/settings/test",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
  });

  it("requests and fetches chapter and course summaries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task_id: "task-1", status: "pending" }) });
    vi.stubGlobal("fetch", fetchMock);

    await requestChapterSummary("ch-1");
    await requestCourseSummary("course-1");
    await fetchChapterSummary("ch-1");
    await fetchCourseSummary("course-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/ai/summary/chapter/ch-1",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:17890/api/v1/ai/summary/course/course-1",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://127.0.0.1:17890/api/v1/ai/summary/chapter/ch-1", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(4, "http://127.0.0.1:17890/api/v1/ai/summary/course/course-1", expect.anything());
  });

  it("creates quiz and flashcard tasks and lists quiz questions by chapter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task_id: "task-2", status: "pending" }) });
    vi.stubGlobal("fetch", fetchMock);

    await requestQuiz({ chapter_id: "ch-1", count: 5, types: ["choice"] }, "la_session");
    await requestFlashcards({ chapter_id: "ch-1", count: 10 }, "la_session");
    await fetchQuizQuestions("ch-1", "la_session");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/ai/quiz",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chapter_id: "ch-1", count: 5, types: ["choice"] }),
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:17890/api/v1/ai/flashcards",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ chapter_id: "ch-1", count: 10 }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:17890/api/v1/ai/quiz?chapter_id=ch-1",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
  });

  it("polls ai task status by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "task-1", task_type: "quiz", status: "done", result_count: 5 }) });
    vi.stubGlobal("fetch", fetchMock);

    const task = await fetchAiTask("task-1", "la_session");

    expect(task).toMatchObject({ id: "task-1", status: "done", result_count: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/ai/tasks/task-1",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
  });

  it("asks a course question with scope, question and history", async () => {
    const answer = {
      answer_md: "递归是函数调用自身。",
      citations: [{ chapter_id: "ch-1", chapter_title: "第一章", start_seconds: 65, excerpt: "递归..." }],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => answer });
    vi.stubGlobal("fetch", fetchMock);

    const result = await askCourseQuestion(
      {
        course_id: "course-1",
        chapter_id: "ch-1",
        question: "什么是递归?",
        history: [
          { role: "user", content: "之前的问题" },
          { role: "assistant", content: "之前的回答" },
        ],
      },
      "la_session",
    );

    expect(result).toEqual(answer);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/ai/ask",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          course_id: "course-1",
          chapter_id: "ch-1",
          question: "什么是递归?",
          history: [
            { role: "user", content: "之前的问题" },
            { role: "assistant", content: "之前的回答" },
          ],
        }),
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
  });

  it("asks a whole-course question with a null chapter scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answer_md: "", citations: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await askCourseQuestion({ course_id: "course-1", chapter_id: null, question: "课程讲了什么?" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/ai/ask",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ course_id: "course-1", chapter_id: null, question: "课程讲了什么?" }),
      }),
    );
  });
});

describe("quiz attempts and mastery client", () => {
  it("submits quiz attempts with the items payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ recorded: 2 }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitQuizAttempts(
      [
        { question_id: "q-1", chosen: "乙", correct: true },
        { question_id: "q-2", chosen: "甲", correct: false },
      ],
      "la_session",
    );

    expect(result).toEqual({ recorded: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/quiz/attempts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          items: [
            { question_id: "q-1", chosen: "乙", correct: true },
            { question_id: "q-2", chosen: "甲", correct: false },
          ],
        }),
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
  });

  it("fetches mastery with an optional course filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchMastery("course 1", "la_session");
    await fetchMastery();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://127.0.0.1:17890/api/v1/stats/mastery?course_id=${encodeURIComponent("course 1")}`,
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:17890/api/v1/stats/mastery", expect.anything());
  });

  it("creates report_pdf exports with a nullable course_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "exp", status: "queued", format: "report_pdf" }) });
    vi.stubGlobal("fetch", fetchMock);

    await createExport({ course_id: null, export_format: "report_pdf" }, "la_session");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/exports",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ course_id: null, export_format: "report_pdf" }),
        headers: expect.objectContaining({ authorization: "Bearer la_session" }),
      }),
    );
  });
});

describe("email client", () => {
  const settings = {
    smtp_host: "smtp.qq.com",
    smtp_port: 465,
    smtp_username: "user@qq.com",
    password_masked: "****",
    email_from: "user@qq.com",
    email_to: "me@example.com",
    configured: true,
    digest_auto: true,
    digest_frequency: "daily",
    digest_hour: 8,
    last_digest_at: null,
  };

  it("reads and updates email settings with PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => settings });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEmailSettings("la_session");
    await updateEmailSettings({ smtp_host: "smtp.qq.com", smtp_port: 465, smtp_password: "secret", digest_auto: true, digest_frequency: "weekly", digest_hour: 20 }, "la_session");
    await updateEmailSettings({ smtp_password: "" }, "la_session");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/email/settings",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:17890/api/v1/email/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ smtp_host: "smtp.qq.com", smtp_port: 465, smtp_password: "secret", digest_auto: true, digest_frequency: "weekly", digest_hour: 20 }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:17890/api/v1/email/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ smtp_password: "" }) }),
    );
  });

  it("posts to the email settings test endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, detail: null }) });
    vi.stubGlobal("fetch", fetchMock);

    await testEmailSettings("la_session");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/email/settings/test",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
  });

  it("sends a note by email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, detail: null }) });
    vi.stubGlobal("fetch", fetchMock);

    await sendNoteEmail("note-1", "la_session");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/email/notes/note-1/send",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
  });

  it("starts a digest email task", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task_id: "task-9", status: "pending" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDigestEmail("la_session");

    expect(result).toEqual({ task_id: "task-9", status: "pending" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17890/api/v1/email/digest/send",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer la_session" }) }),
    );
  });
});

describe("session token and unauthorized handling", () => {
  it("attaches the stored session token to read and write requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    setSessionToken("la_stored");

    await fetchCourses();
    await updateSettings({ organization_name: "Acme" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:17890/api/v1/courses",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_stored" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:17890/api/v1/settings",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer la_stored" }) }),
    );
  });

  it("invokes the unauthorized handler on 401 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(fetchNotes()).rejects.toMatchObject({ status: 401 });
    await expect(fetchNotes()).rejects.toBeInstanceOf(ApiError);

    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it("does not invoke the unauthorized handler on other error statuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(fetchNotes()).rejects.toMatchObject({ status: 500 });

    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
