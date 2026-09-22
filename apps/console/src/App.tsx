import { useEffect, useState } from "react";
import type { AuthResponse, PluginClientStatus } from "./api/client";
import { fetchApiStatus, fetchMe, fetchSetupStatus, setSessionToken, setUnauthorizedHandler, type SetupStatus } from "./api/client";
import { Logo, NavIcon, SidebarToggleIcon } from "./components/icons";
import { buildRouteHash, navItems, parseRouteHash, type ConsolePage, type RouteState, type SettingsTab } from "./navSlug";
import { AuthPanel } from "./pages/AuthPanel";
import { CourseDetailPage } from "./pages/CourseDetail";
import { Courses } from "./pages/Courses";
import { Dashboard } from "./pages/Dashboard";
import { Installer } from "./pages/Installer";
import { Review } from "./pages/Review";
import { Search } from "./pages/Search";
import { SystemSettings } from "./pages/SystemSettings";
import { formatPluginBindingState, getPluginBindingState, type PluginBindingState } from "./pages/pluginStatus";
import "./styles.css";

const SESSION_STORAGE_KEY = "learn_assistant_session";
const HEALTH_POLL_INTERVAL_MS = 10000;

function readInitialRoute(): RouteState | null {
  if (typeof window === "undefined") return null;
  return window.location.hash ? parseRouteHash(window.location.hash) : null;
}

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

function WorkspacePage({ page, session, courseDetailId, courseChapterId, settingsTab, onOpenCourseDetail, onCloseCourseDetail, onSelectChapter, onSettingsTabChange, onSessionChange, onPluginStatusChange }: { page: ConsolePage; session: AuthResponse | null; courseDetailId: string | null; courseChapterId: string | null; settingsTab: SettingsTab | null; onOpenCourseDetail: (courseId: string) => void; onCloseCourseDetail: () => void; onSelectChapter: (chapterId: string | null) => void; onSettingsTabChange: (tab: SettingsTab) => void; onSessionChange: (session: AuthResponse | null) => void; onPluginStatusChange: (clients: PluginClientStatus[]) => void }) {
  if (page === "总览") return <Dashboard />;
  if (page === "课程") {
    return courseDetailId
      ? <CourseDetailPage courseId={courseDetailId} initialChapterId={courseChapterId} token={session?.token} onBack={onCloseCourseDetail} onSelectChapter={onSelectChapter} />
      : <Courses onOpenDetail={onOpenCourseDetail} />;
  }
  if (page === "复习") return <Review token={session?.token} />;
  if (page === "搜索") return <Search />;
  return <SystemSettings tab={settingsTab} onTabChange={onSettingsTabChange} session={session} onSessionChange={onSessionChange} onPluginStatusChange={onPluginStatusChange} />;
}

export function App({ initialSetupStatus, initialPage = "总览", initialSession }: AppProps) {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | undefined>(initialSetupStatus);
  const [activePage, setActivePage] = useState<ConsolePage>(() => readInitialRoute()?.page ?? initialPage);
  const [courseDetailId, setCourseDetailId] = useState<string | null>(() => readInitialRoute()?.courseId ?? null);
  const [courseChapterId, setCourseChapterId] = useState<string | null>(() => readInitialRoute()?.chapterId ?? null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(() => readInitialRoute()?.settingsTab ?? null);
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
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      const route = parseRouteHash(window.location.hash);
      setActivePage(route.page);
      setCourseDetailId(route.page === "课程" ? route.courseId : null);
      setCourseChapterId(route.page === "课程" ? route.chapterId : null);
      if (route.page === "系统设置") setSettingsTab(route.settingsTab);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!session || !setupStatus?.installed) return;
    const hash = buildRouteHash(activePage, {
      courseId: activePage === "课程" ? courseDetailId : null,
      chapterId: activePage === "课程" ? courseChapterId : null,
      settingsTab: activePage === "系统设置" ? settingsTab : null,
    });
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }, [activePage, courseDetailId, courseChapterId, settingsTab, session, setupStatus?.installed]);

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
            <Logo size={20} className="brand-logo" />
            <span className="brand-expand-chevron" aria-hidden="true">››</span>
          </button>
        ) : (
          <h1><Logo size={26} className="brand-logo" /><span className="brand-text">学习助手控制台</span></h1>
        )}
        <nav>
          {navItems.map((item) => (
            <button key={item} type="button" title={item} data-active={activePage === item ? "yes" : "no"} onClick={() => { setActivePage(item); setCourseDetailId(null); setCourseChapterId(null); }}>
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
          <button type="button" className="status-pill status-pill-button" data-tone={pluginState === "online" ? "ok" : pluginState === "offline" ? "warn" : "muted"} title="查看插件管理" onClick={() => { setActivePage("系统设置"); setSettingsTab("plugins"); }}>插件状态: {formatPluginBindingState(pluginState)}</button>
          <span className="status-pill" data-tone="muted">组织: Local Workspace</span>
          <span className="user-chip">{session.user.display_name} · {session.user.email}</span>
          <button type="button" className="text-button" onClick={() => handleSessionChange(null)}>退出</button>
        </section>
        <WorkspacePage page={activePage} session={session} courseDetailId={courseDetailId} courseChapterId={courseChapterId} settingsTab={settingsTab} onOpenCourseDetail={(id) => { setCourseDetailId(id); setCourseChapterId(null); }} onCloseCourseDetail={() => { setCourseDetailId(null); setCourseChapterId(null); }} onSelectChapter={setCourseChapterId} onSettingsTabChange={setSettingsTab} onSessionChange={handleSessionChange} onPluginStatusChange={(clients: PluginClientStatus[]) => setPluginState(getPluginBindingState(clients))} />
      </main>
    </div>
  );
}
