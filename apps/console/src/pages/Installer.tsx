import type { SetupStatus } from "../api/client";

interface InstallerProps {
  status: SetupStatus;
}

export function Installer({ status }: InstallerProps) {
  return (
    <main className="installer-shell">
      <section className="installer-panel">
        <header>
          <p className="eyebrow">Learning Assistant</p>
          <h1>系统安装向导</h1>
          <p>启动服务后先检查环境；未安装时在这里配置远端或本机数据库，再初始化业务表。</p>
        </header>

        <div className="setup-checks" aria-label="安装状态">
          <span data-ok={status.env_exists ? "yes" : "no"}>配置文件</span>
          <span data-ok={status.database_configured ? "yes" : "no"}>数据库配置</span>
          <span data-ok={status.database_connected ? "yes" : "no"}>连接测试</span>
          <span data-ok={status.schema_initialized ? "yes" : "no"}>数据表</span>
        </div>

        <form className="installer-form">
          <label>
            数据库类型
            <select defaultValue={status.database_type ?? "postgresql"}>
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL / MariaDB</option>
            </select>
          </label>
          <label>
            远端数据库地址
            <input placeholder="db.example.com 或 127.0.0.1" />
          </label>
          <label>
            端口
            <input placeholder="5432 / 3306" inputMode="numeric" />
          </label>
          <label>
            数据库名
            <input placeholder="learning_assistant" />
          </label>
          <label>
            用户名
            <input placeholder="learn_user" />
          </label>
          <label>
            密码
            <input type="password" placeholder="数据库密码" />
          </label>
          <label>
            管理员邮箱
            <input placeholder="admin@example.com" />
          </label>
          <label>
            管理员密码
            <input type="password" placeholder="至少 6 位" />
          </label>
        </form>

        <footer className="installer-actions">
          <span>下一步: {status.next_step}</span>
          <button type="button">测试连接</button>
          <button type="button">初始化安装</button>
        </footer>
      </section>
    </main>
  );
}
