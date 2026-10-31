import { useEffect, useMemo, useState } from "react";
import { bulkDeleteAuditLogs, fetchAuditLogs, type AuditLogItem } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { BulkBar, ListToolbar, ToolbarSearch, ToolbarSelect } from "../components/ListControls";
import { toast } from "../components/toast";
import { matchesKeyword, toggleAllIds, toggleId } from "../listQuery";
import { auditLogTimeRange } from "./auditLogQuery";

const AUDIT_LOG_LIMIT = 300;

const ACTION_OPTIONS = [
  { value: "", label: "全部动作" },
  { value: "login_failed", label: "登录失败" },
  { value: "login_success", label: "登录成功" },
  { value: "password_changed", label: "修改密码" },
  { value: "user_registered", label: "注册账号" },
  { value: "setup_admin_created", label: "安装创建管理员" },
  { value: "course_updated", label: "课程变更" },
  { value: "note_deleted", label: "删除笔记" },
  { value: "notes_bulk_deleted", label: "批量删除笔记" },
  { value: "notes_bulk_tagged", label: "批量改标签" },
  { value: "review_card_updated", label: "复习卡变更" },
  { value: "review_card_deleted", label: "删除复习卡" },
  { value: "adapter_deleted", label: "删除适配器" },
  { value: "audit_logs_deleted", label: "清理操作日志" },
];

/** 动作 → 中文名 + 色调 */
const ACTION_META: Record<string, { label: string; tone: string }> = {
  login_success: { label: "登录成功", tone: "ok" },
  login_failed: { label: "登录失败", tone: "danger" },
  password_changed: { label: "修改密码", tone: "warn" },
  user_registered: { label: "注册账号", tone: "ok" },
  setup_admin_created: { label: "安装创建管理员", tone: "warn" },
  course_updated: { label: "课程变更", tone: "muted" },
  note_deleted: { label: "删除笔记", tone: "danger" },
  notes_bulk_deleted: { label: "批量删除笔记", tone: "danger" },
  notes_bulk_tagged: { label: "批量改标签", tone: "muted" },
  review_card_updated: { label: "复习卡变更", tone: "muted" },
  review_card_deleted: { label: "删除复习卡", tone: "danger" },
  adapter_deleted: { label: "删除适配器", tone: "danger" },
  audit_logs_deleted: { label: "清理操作日志", tone: "danger" },
};

function formatTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function payloadSummary(payload: Record<string, unknown>): string {
  const skip = new Set(["note_ids"]);
  const parts = Object.entries(payload)
    .filter(([key, value]) => !skip.has(key) && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  return parts.join("  ") || "—";
}

export function AuditLogPanel() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [action, setAction] = useState("");
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [message, setMessage] = useState("正在读取操作日志...");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const range = auditLogTimeRange(startDate, endDate);
    if (range.error) {
      setItems([]);
      setMessage(range.error);
      return;
    }

    let cancelled = false;
    setMessage("正在读取操作日志...");
    void fetchAuditLogs({ limit: AUDIT_LOG_LIMIT, start: range.start, end: range.end })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        if (!result.items.length) {
          setMessage(startDate || endDate ? "该时间范围内暂无操作记录。" : "暂无操作记录。");
        } else {
          setMessage("");
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setItems([]);
        setMessage(error instanceof Error ? error.message : "操作日志读取失败");
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, reloadKey]);

  // 条件变化后旧勾选可能已经不在列表里,统一清掉,避免"看不见却被删"
  useEffect(() => {
    setSelected([]);
  }, [action, keyword, startDate, endDate]);

  const visible = useMemo(() => {
    const byAction = action ? items.filter((item) => item.action === action) : items;
    return byAction.filter((item) =>
      matchesKeyword(
        [item.action, item.user_email, item.resource_id, formatTime(item.created_at), JSON.stringify(item.payload)],
        keyword,
      ),
    );
  }, [items, action, keyword]);

  const visibleIds = useMemo(() => visible.map((item) => item.id), [visible]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function askDelete(): void {
    if (!selected.length) return;
    setDeleteError("");
    setConfirmDelete(true);
  }

  function closeDeleteDialog(): void {
    if (busy) return;
    setConfirmDelete(false);
    setDeleteError("");
  }

  async function removeSelected(): Promise<void> {
    if (!selected.length || busy) return;
    setBusy(true);
    setDeleteError("");
    try {
      const result = await bulkDeleteAuditLogs(selected);
      setConfirmDelete(false);
      setSelected([]);
      setReloadKey((current) => current + 1);
      toast.success(`已删除 ${result.affected} 条操作日志`);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "批量删除操作日志失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel">
      <h2>操作日志</h2>
      <p>登录、改密、课程与笔记变更都会留痕。排查「密码为什么变了」这类问题时，先筛选「登录失败 / 修改密码」。</p>

      <ListToolbar count={visible.length} total={items.length}>
        <ToolbarSearch value={keyword} onChange={setKeyword} placeholder="搜索账号 / 时间 / 内容" />
        <ToolbarSelect label="动作" value={action} onChange={setAction} options={ACTION_OPTIONS} />
        <label className="filter-item">
          <span>从</span>
          <input
            type="date"
            className="filter-date"
            aria-label="起始日期"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label className="filter-item">
          <span>到</span>
          <input
            type="date"
            className="filter-date"
            aria-label="结束日期"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        {startDate || endDate ? (
          <button
            type="button"
            className="text-button-sm"
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
          >
            清除时间
          </button>
        ) : null}
      </ListToolbar>

      <div className="audit-list-head">
        <button
          type="button"
          className="text-button-sm"
          disabled={!visibleIds.length}
          onClick={() => setSelected(toggleAllIds(selected, visibleIds, !allSelected))}
        >
          {allSelected ? "取消全选" : "全选当前结果"}
        </button>
        <span className="audit-hint">按时间倒序 · 最多显示最近 {AUDIT_LOG_LIMIT} 条</span>
      </div>

      {message ? <p>{message}</p> : null}
      {!message && !visible.length ? <p>没有匹配的记录，换个关键词或动作试试。</p> : null}

      {visible.length ? (
        <div className="record-list">
          {visible.map((item) => {
            const meta = ACTION_META[item.action] ?? { label: item.action, tone: "muted" };
            return (
              <article
                key={item.id}
                className="record-row audit-row"
                data-selected={selected.includes(item.id) ? "yes" : "no"}
              >
                <div className="audit-row-head">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    aria-label={`选择 ${formatTime(item.created_at)} 的${meta.label}记录`}
                    onChange={() => setSelected(toggleId(selected, item.id))}
                  />
                  <span className="pill" data-tone={meta.tone === "ok" ? "ok" : "muted"}>
                    {meta.label}
                  </span>
                  <span className="audit-time">{formatTime(item.created_at)}</span>
                  <span className="audit-user">{item.user_email ?? "匿名 / 账号不存在"}</span>
                </div>
                <p className="audit-detail">{payloadSummary(item.payload)}</p>
              </article>
            );
          })}
        </div>
      ) : null}

      <BulkBar count={selected.length} onClear={() => setSelected([])}>
        <button
          type="button"
          className="text-button-sm danger-text"
          disabled={busy}
          onClick={askDelete}
        >
          {busy ? "删除中..." : "删除选中"}
        </button>
      </BulkBar>

      {confirmDelete ? (
        <ConfirmDialog
          title="删除操作日志？"
          confirmLabel={`删除 ${selected.length} 条`}
          busyLabel="删除中..."
          busy={busy}
          error={deleteError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void removeSelected()}
        >
          <p className="confirm-text">
            确定删除选中的 <strong>{selected.length}</strong> 条操作日志？
          </p>
          <p className="confirm-warning">
            删除后不可恢复；系统会额外写入一条「清理操作日志」记录，保留清理时间与数量。
          </p>
        </ConfirmDialog>
      ) : null}
    </article>
  );
}
