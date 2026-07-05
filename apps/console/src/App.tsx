import { Dashboard } from "./pages/Dashboard";
import "./styles.css";

const navItems = ["课程", "字幕", "笔记", "导出", "站点适配器", "用户与授权", "设置"];

export function App() {
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
          <span>API 服务: 待连接</span>
          <span>插件状态: 待绑定</span>
          <span>组织: Local Workspace</span>
        </section>
        <Dashboard />
      </main>
    </div>
  );
}
