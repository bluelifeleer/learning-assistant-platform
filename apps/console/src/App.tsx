import { useEffect, useState } from "react";
import type { PluginClientStatus } from "./api/client";
import { fetchSetupStatus, type SetupStatus } from "./api/client";
import { CourseDetail } from "./pages/CourseDetail";
import { Courses } from "./pages/Courses";
import { Dashboard } from "./pages/Dashboard";
import { Exports } from "./pages/Exports";
import { Installer } from "./pages/Installer";
import { Settings } from "./pages/Settings";
import { formatPluginBindingState, getPluginBindingState, type PluginBindingState } from "./pages/pluginStatus";
import "./styles.css";

const navItems = ["课程", "字幕", "笔记", "导出", "站点适配器", "用户与授权", "设置"] as const;
type ConsolePage = (typeof navItems)[number];

interface AppProps {
  initialSetupStatus?: SetupStatus;
  initialPage?: ConsolePage;
}

function WorkspacePage({ page }: { page: ConsolePage }) {
  if (page === "课程") return <Courses />;
  if (page === "字幕") return <CourseDetail title="字幕" description="按课程和章节查看字幕片段，支持后续筛选、校对和导出。" />;
  if (page === "笔记") return <CourseDetail title="笔记" description="记录人工补充的章节笔记，和字幕、课程章节关联。" />;
  if (page === "导出") return <Exports />;
  if (page === "站点适配器") return <Settings title="站点适配器" description="查看内置 adapter、启用状态和匹配域名。" />;
  if (page === "用户与授权") return <Settings title="用户与授权" description="管理本地用户、插件 Token 和后续商业授权信息。" />;
  return <Settings title="设置" description="配置本地 API、组织信息、数据库连接和系统偏好。" />;
}

export function App({ initialSetupStatus, initialPage = "课程" }: AppProps) {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | undefined>(initialSetupStatus);
  const [activePage, setActivePage] = useState<ConsolePage>(initialPage);
  const [pluginState, setPluginState] = useState<PluginBindingState>("unbound");

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
        </section>
        {activePage === "课程" ? (
          <Dashboard onPluginStatusChange={(clients: PluginClientStatus[]) => setPluginState(getPluginBindingState(clients))} />
        ) : (
          <WorkspacePage page={activePage} />
        )}
      </main>
    </div>
  );
}
