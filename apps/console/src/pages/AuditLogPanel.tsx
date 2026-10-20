import { useEffect, useMemo, useState } from "react";
import { fetchAuditLogs, type AuditLogItem } from "../api/client";
import { ListToolbar, ToolbarSearch, ToolbarSelect } from "../components/ListControls";
import { matchesKeyword } from "../listQuery";

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
  const [message, setMessage] = useState("正在读取操作日志...");

  useEffect(() => {
    setMessage("正在读取操作日志...");
    void fetchAuditLogs({ limit: 300 })
      .then((result) => {
        setItems(result.items);
        setMessage(result.items.length ? "" : "暂无操作记录。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "操作日志读取失败"));
  }, []);

  const visible = useMemo(() => {
    const byAction = action ? items.filter((item) => item.action === action) : items;
    return byAction.filter((item) =>
      matchesKeyword(
        [item.action, item.user_email, item.resource_id, JSON.stringify(item.payload)],
        keyword,
      ),
    );
  }, [items, action, keyword]);

  return (
    <article className="panel">
      <h2>操作日志</h2>
      <p>登录、改密、课程与笔记变更都会留痕。排查「密码为什么变了」这类问题时，先筛选「登录失败 / 修改密码」。</p>
      <ListToolbar count={visible.length} total={items.length}>
        <ToolbarSearch value={keyword} onChange={setKeyword} placeholder="搜索账号 / 资源 id / 内容" />
        <ToolbarSelect label="动作" value={action} onChange={setAction} options={ACTION_OPTIONS} />
      </ListToolbar>

      {message ? <p>{message}</p> : null}

      {visible.length ? (
        <div className="record-list">
          {visible.map((item) => {
            const meta = ACTION_META[item.action] ?? { label: item.action, tone: "muted" };
            return (
              <article key={item.id} className="record-row audit-row">
                <div className="audit-row-head">
                  <span className="pill" data-tone={meta.tone === "danger" ? "muted" : meta.tone === "warn" ? "muted" : "ok"}>
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
    </article>
  );
}
