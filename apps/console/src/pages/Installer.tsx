import { useState } from "react";
import {
  initializeSetup,
  testDatabaseConnection,
  type DatabaseConfigPayload,
  type DatabaseType,
  type SetupStatus,
} from "../api/client";

interface InstallerProps {
  status: SetupStatus;
  onInstalled?: (status: SetupStatus) => void;
}

interface InstallerFormState {
  database_type: DatabaseType;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  organization_name: string;
  admin_email: string;
  admin_password: string;
  license_key: string;
}

const defaultForm: InstallerFormState = {
  database_type: "postgresql",
  host: "127.0.0.1",
  port: "5432",
  database: "learn_assistant",
  username: "learn_assistant",
  password: "learn_assistant",
  organization_name: "Local Workspace",
  admin_email: "admin@example.local",
  admin_password: "change-me-local",
  license_key: "",
};

function toDatabasePayload(form: InstallerFormState): DatabaseConfigPayload {
  return {
    database_type: form.database_type,
    host: form.host,
    port: Number(form.port),
    database: form.database,
    username: form.username,
    password: form.password,
  };
}

export function Installer({ status, onInstalled }: InstallerProps) {
  const [form, setForm] = useState<InstallerFormState>({ ...defaultForm, database_type: (status.database_type as DatabaseType) ?? "postgresql" });
  const [message, setMessage] = useState(status.error ?? status.next_step);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof InstallerFormState>(key: K, value: InstallerFormState[K]) {
    const next = { ...form, [key]: value };
    if (key === "database_type") {
      next.port = value === "mysql" ? "3306" : "5432";
    }
    setForm(next);
  }

  async function handleTestConnection() {
    setBusy(true);
    try {
      const result = await testDatabaseConnection(toDatabasePayload(form));
      setMessage(result.ok ? `连接成功: ${result.database_url}` : `连接失败: ${result.error}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "连接测试失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleInitialize() {
    setBusy(true);
    try {
      const result = await initializeSetup({
        organization_name: form.organization_name,
        admin_email: form.admin_email,
        admin_password: form.admin_password,
        license_key: form.license_key || undefined,
        database: toDatabasePayload(form),
        initialize_schema: true,
      });
      setMessage(result.next_step);
      if (result.installed) onInstalled?.(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "初始化安装失败");
    } finally {
      setBusy(false);
    }
  }

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
          <span data-ok="no">插件安装</span>
        </div>

        <form className="installer-form">
          <label>
            数据库类型
            <select value={form.database_type} onChange={(event) => update("database_type", event.target.value as DatabaseType)}>
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL / MariaDB</option>
            </select>
          </label>
          <label>
            远端数据库地址
            <input value={form.host} onChange={(event) => update("host", event.target.value)} placeholder="db.example.com 或 127.0.0.1" />
          </label>
          <label>
            端口
            <input value={form.port} onChange={(event) => update("port", event.target.value)} placeholder="5432 / 3306" inputMode="numeric" />
          </label>
          <label>
            数据库名
            <input value={form.database} onChange={(event) => update("database", event.target.value)} placeholder="learning_assistant" />
          </label>
          <label>
            用户名
            <input value={form.username} onChange={(event) => update("username", event.target.value)} placeholder="learn_user" />
          </label>
          <label>
            密码
            <input value={form.password} onChange={(event) => update("password", event.target.value)} type="password" placeholder="数据库密码" />
          </label>
          <label>
            组织名称
            <input value={form.organization_name} onChange={(event) => update("organization_name", event.target.value)} placeholder="Local Workspace" />
          </label>
          <label>
            管理员邮箱
            <input value={form.admin_email} onChange={(event) => update("admin_email", event.target.value)} placeholder="admin@example.com" />
          </label>
          <label>
            管理员密码
            <input value={form.admin_password} onChange={(event) => update("admin_password", event.target.value)} type="password" placeholder="至少 6 位" />
          </label>
          <label>
            License Key
            <input value={form.license_key} onChange={(event) => update("license_key", event.target.value)} placeholder="可留空，商业版再激活" />
          </label>
        </form>

        <footer className="installer-actions">
          <span>{message}</span>
          <button type="button" disabled={busy} onClick={handleTestConnection}>测试连接</button>
          <button type="button" disabled={busy} onClick={handleInitialize}>初始化安装</button>
        </footer>
      </section>
    </main>
  );
}
