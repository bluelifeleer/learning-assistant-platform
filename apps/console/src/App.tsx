import { useEffect, useState } from "react";
import type { AuthResponse, PluginClientStatus } from "./api/client";
import { fetchApiStatus, fetchMe, fetchSetupStatus, setSessionToken, setUnauthorizedHandler, type SetupStatus } from "./api/client";
import { Adapters } from "./pages/Adapters";
import { Logo, NavIcon, SidebarToggleIcon } from "./components/icons";
import { AuthPanel } from "./pages/AuthPanel";
import { CourseDetailPage } from "./pages/CourseDetail";
import { Courses } from "./pages/Courses";
import { Dashboard } from "./pages/Dashboard";
import { Exports } from "./pages/Exports";
import { Installer } from "./pages/Installer";
import { Notes } from "./pages/Notes";
import { PluginPanel } from "./pages/PluginPanel";
import { Review } from "./pages/Review";
import { Search } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { Transcripts } from "./pages/Transcripts";
import { UsersAuth } from "./pages/UsersAuth";
import { formatPluginBindingState, getPluginBindingState, type PluginBindingState } from "./pages/pluginStatus";
import "./styles.css";

const navItems = ["总览", "课程", "字幕", "笔记", "搜索", "复习", "导出", "插件管理", "站点适配器", "用户与授权", "设置"] as const;
type ConsolePage = (typeof navItems)[number];

const SESSION_STORAGE_KEY = "learn_assistant_session";
const HEALTH_POLL_INTERVAL_MS = 10000;

interface AppProps {
  initialSetupStatus?: SetupStatus;
  initialPage?: ConsolePage;
  initialSession?: AuthResponse | null;
}

function loadSavedSession(): AuthResponse | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as AuthResponse) : null;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function clearSavedSession(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(SESSION_STORAGE_KEY);
  setSessionToken(null);
}

function WorkspacePage({ page, session, courseDetailId, onOpenCourseDetail, onCloseCourseDetail, onSessionChange, onPluginStatusChange }: { page: ConsolePage; session: AuthResponse | null; courseDetailId: string | null; onOpenCourseDetail: (courseId: string) => void; onCloseCourseDetail: () => void; onSessionChange: (session: AuthResponse | null) => void; onPluginStatusChange: (clients: PluginClientStatus[]) => void }) {
  if (page === "总览") return <Dashboard />;
  if (page === "课程") {
    return courseDetailId
      ? <CourseDetailPage courseId={courseDetailId} onBack={onCloseCourseDetail} />
      : <Courses onOpenDetail={onOpenCourseDetail} />;
  }
  if (page === "字幕") return <Transcripts />;
  if (page === "笔记") return <Notes token={session?.token} />;
  if (page === "搜索") return <Search />;
  if (page === "复习") return <Review token={session?.token} />;
  if (page === "导出") return <Exports token={session?.token} />;
  if (page === "插件管理") return <PluginPanel onStatusChange={onPluginStatusChange} />;
  if (page === "站点适配器") return <Adapters />;
  if (page === "用户与授权") return <UsersAuth session={session} onSessionChange={onSessionChange} />;
  return <Settings title="设置" description="配置本地 API、组织信息、数据库连接和系统偏好。" />;
}

export function App({ initialSetupStatus, initialPage = "总览", initialSession }: AppProps) {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | undefined>(initialSetupStatus);
  const [activePage, setActivePage] = useState<ConsolePage>(initialPage);
  const [courseDetailId, setCourseDetailId] = useState<string | null>(null);
  const [pluginState, setPluginState] = useState<PluginBindingState>("unbound");
  const [session, setSession] = useState<AuthResponse | null>(initialSession === undefined ? loadSavedSession() : initialSession);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem("la_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem("la_sidebar_collapsed", current ? "0" : "1");
      } catch {
        // localStorage 不可用时仅保持当次会话状态
      }
      return !current;
    });
  }

  setSessionToken(session?.token ?? null);

  function handleSessionChange(next: AuthResponse | null) {
    setSessionToken(next?.token ?? null);
    if (typeof localStorage !== "undefined") {
      if (next) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setSession(next);
  }

  useEffect(() => {
    if (initialSetupStatus) return;
    void fetchSetupStatus()
      .then(setSetupStatus)
      .catch((error: unknown) =>
        setSetupStatus({
          installed: false,
          next_step: error instanceof Error ? error.message : "启动 API 服务后继续安装",
        }),
      );
  }, [initialSetupStatus]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSavedSession();
      setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void fetchMe(session.token).catch(() => {
      if (cancelled) return;
      clearSavedSession();
      setSession(null);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const probe = () =>
      fetchApiStatus()
        .then(() => {
          if (!cancelled) setApiOnline(true);
        })
        .catch(() => {
          if (!cancelled) setApiOnline(false);
        });
    void probe();
    const timer = globalThis.setInterval(() => void probe(), HEALTH_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [session?.token]);

  if (!setupStatus) {
    return <main className="installer-shell"><section className="installer-panel"><h1>系统安装向导</h1><p>正在检查安装状态...</p></section></main>;
  }

  if (!setupStatus.installed) {
    return <Installer status={setupStatus} onInstalled={setSetupStatus} />;
  }

  if (!session) {
    return <main className="auth-shell"><AuthPanel session={null} onSessionChange={handleSessionChange} /></main>;
  }

  return (
    <div className={sidebarCollapsed ? "app-shell app-shell-collapsed" : "app-shell"}>
      <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        {sidebarCollapsed ? (
          <button type="button" className="brand-expand" title="展开导航" aria-label="展开导航" onClick={toggleSidebar}>
            <Logo size={26} className="brand-logo" />
          </button>
        ) : (
          <h1><Logo size={26} className="brand-logo" /><span className="brand-text">学习助手控制台</span></h1>
        )}
        <nav>
          {navItems.map((item) => (
            <button key={item} type="button" title={item} data-active={activePage === item ? "yes" : "no"} onClick={() => { setActivePage(item); setCourseDetailId(null); }}>
              <NavIcon name={item} />
              <span className="nav-label">{item}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="workspace">
        <section className="status-row">
          {sidebarCollapsed ? null : (
            <button type="button" className="nav-toggle" title="收缩导航" aria-label="收缩导航" onClick={toggleSidebar}>
              <SidebarToggleIcon />
            </button>
          )}
          <span className="status-pill" data-tone={apiOnline === null ? "muted" : apiOnline ? "ok" : "danger"}>API 服务: {apiOnline === null ? "检测中" : apiOnline ? "已连接" : "未连接"}</span>
          <span className="status-pill" data-tone={pluginState === "online" ? "ok" : pluginState === "offline" ? "warn" : "muted"}>插件状态: {formatPluginBindingState(pluginState)}</span>
          <span className="status-pill" data-tone="muted">组织: Local Workspace</span>
          <span className="user-chip">{session.user.display_name} · {session.user.email}</span>
          <button type="button" className="text-button" onClick={() => handleSessionChange(null)}>退出</button>
        </section>
        <WorkspacePage page={activePage} session={session} courseDetailId={courseDetailId} onOpenCourseDetail={setCourseDetailId} onCloseCourseDetail={() => setCourseDetailId(null)} onSessionChange={handleSessionChange} onPluginStatusChange={(clients: PluginClientStatus[]) => setPluginState(getPluginBindingState(clients))} />
      </main>
    </div>
  );
}
