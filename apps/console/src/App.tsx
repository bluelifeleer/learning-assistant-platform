import { useEffect, useState } from "react";
import type { AuthResponse, PluginClientStatus } from "./api/client";
import { fetchSetupStatus, type SetupStatus } from "./api/client";
import { Adapters } from "./pages/Adapters";
import { AuthPanel } from "./pages/AuthPanel";
import { Courses } from "./pages/Courses";
import { Exports } from "./pages/Exports";
import { Installer } from "./pages/Installer";
import { Notes } from "./pages/Notes";
import { PluginPanel } from "./pages/PluginPanel";
import { Settings } from "./pages/Settings";
import { Transcripts } from "./pages/Transcripts";
import { UsersAuth } from "./pages/UsersAuth";
import { formatPluginBindingState, getPluginBindingState, type PluginBindingState } from "./pages/pluginStatus";
import "./styles.css";

const navItems = ["课程", "字幕", "笔记", "导出", "插件管理", "站点适配器", "用户与授权", "设置"] as const;
type ConsolePage = (typeof navItems)[number];

interface AppProps {
  initialSetupStatus?: SetupStatus;
  initialPage?: ConsolePage;
  initialSession?: AuthResponse | null;
}

function loadSavedSession(): AuthResponse | null {
  if (typeof localStorage === "undefined") return null;
  const saved = localStorage.getItem("learn_assistant_session");
  return saved ? (JSON.parse(saved) as AuthResponse) : null;
}

function WorkspacePage({ page, session, onSessionChange, onPluginStatusChange }: { page: ConsolePage; session: AuthResponse | null; onSessionChange: (session: AuthResponse | null) => void; onPluginStatusChange: (clients: PluginClientStatus[]) => void }) {
  if (page === "课程") return <Courses />;
  if (page === "字幕") return <Transcripts />;
  if (page === "笔记") return <Notes token={session?.token} />;
  if (page === "导出") return <Exports token={session?.token} />;
  if (page === "插件管理") return <PluginPanel onStatusChange={onPluginStatusChange} />;
  if (page === "站点适配器") return <Adapters />;
  if (page === "用户与授权") return <UsersAuth session={session} onSessionChange={onSessionChange} />;
  return <Settings title="设置" description="配置本地 API、组织信息、数据库连接和系统偏好。" />;
}

export function App({ initialSetupStatus, initialPage = "课程", initialSession }: AppProps) {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | undefined>(initialSetupStatus);
  const [activePage, setActivePage] = useState<ConsolePage>(initialPage);
  const [pluginState, setPluginState] = useState<PluginBindingState>("unbound");
  const [session, setSession] = useState<AuthResponse | null>(initialSession === undefined ? loadSavedSession() : initialSession);

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

  if (!setupStatus) {
    return <main className="installer-shell"><section className="installer-panel"><h1>系统安装向导</h1><p>正在检查安装状态...</p></section></main>;
  }

  if (!setupStatus.installed) {
    return <Installer status={setupStatus} onInstalled={setSetupStatus} />;
  }

  if (!session) {
    return <main className="auth-shell"><AuthPanel session={null} onSessionChange={setSession} /></main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>学习助手控制台</h1>
        <nav>
          {navItems.map((item) => (
            <button key={item} type="button" data-active={activePage === item ? "yes" : "no"} onClick={() => setActivePage(item)}>
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <main className="workspace">
        <section className="status-row">
          <span>API 服务: 已连接</span>
          <span>插件状态: {formatPluginBindingState(pluginState)}</span>
          <span>组织: Local Workspace</span>
          <span className="user-chip">{session.user.display_name} · {session.user.email}</span>
          <button type="button" className="text-button" onClick={() => { localStorage.removeItem("learn_assistant_session"); setSession(null); }}>退出</button>
        </section>
        <WorkspacePage page={activePage} session={session} onSessionChange={setSession} onPluginStatusChange={(clients: PluginClientStatus[]) => setPluginState(getPluginBindingState(clients))} />
      </main>
    </div>
  );
}
