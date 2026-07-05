import { useEffect, useState } from "react";
import { fetchSetupStatus, type SetupStatus } from "./api/client";
import { Dashboard } from "./pages/Dashboard";
import { Installer } from "./pages/Installer";
import "./styles.css";

const navItems = ["课程", "字幕", "笔记", "导出", "站点适配器", "用户与授权", "设置"];

interface AppProps {
  initialSetupStatus?: SetupStatus;
}

export function App({ initialSetupStatus }: AppProps) {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | undefined>(initialSetupStatus);

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
            <button key={item} type="button">
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <main className="workspace">
        <section className="status-row">
          <span>API 服务: 已连接</span>
          <span>插件状态: 待绑定</span>
          <span>组织: Local Workspace</span>
        </section>
        <Dashboard />
      </main>
    </div>
  );
}
