import { describe, expect, it } from "vitest";
import { auditLogTimeRange } from "./auditLogQuery";

describe("auditLogTimeRange", () => {
  it("没有日期时不下发时间参数", () => {
    expect(auditLogTimeRange("", "")).toEqual({ start: undefined, end: undefined });
  });

  it("起止日期覆盖本地整天", () => {
    const range = auditLogTimeRange("2026-10-30", "2026-10-30");

    expect(range.error).toBeUndefined();
    expect(new Date(range.start!).getTime()).toBe(new Date("2026-10-30T00:00:00").getTime());
    expect(new Date(range.end!).getTime()).toBe(new Date("2026-10-30T23:59:59.999").getTime());
  });

  it("只填一边时另一边留空", () => {
    expect(auditLogTimeRange("2026-10-30", "").end).toBeUndefined();
    expect(auditLogTimeRange("", "2026-10-30").start).toBeUndefined();
  });

  it("起始日期晚于结束日期时报错", () => {
    expect(auditLogTimeRange("2026-10-31", "2026-10-30").error).toBe("起始日期不能晚于结束日期");
  });

  it("非法日期不静默通过", () => {
    expect(auditLogTimeRange("not-a-date", "").error).toBe("起始日期格式不正确");
  });
});
