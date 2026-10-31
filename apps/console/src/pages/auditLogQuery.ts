/**
 * 操作日志的时间筛选:日期选择器给的是本地日期,接口要的是时间点。
 * 起始取当天 00:00:00.000,结束取当天 23:59:59.999,再转成 UTC ISO,
 * 这样"10 月 30 日到 10 月 30 日"能包含整天的记录,且不受时区影响。
 */
export interface AuditLogTimeRange {
  start?: string;
  end?: string;
  error?: string;
}

export function auditLogTimeRange(startDate: string, endDate: string): AuditLogTimeRange {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null;

  if (start && Number.isNaN(start.getTime())) return { error: "起始日期格式不正确" };
  if (end && Number.isNaN(end.getTime())) return { error: "结束日期格式不正确" };
  if (start && end && start.getTime() > end.getTime()) {
    return { error: "起始日期不能晚于结束日期" };
  }

  return {
    start: start ? start.toISOString() : undefined,
    end: end ? end.toISOString() : undefined,
  };
}
