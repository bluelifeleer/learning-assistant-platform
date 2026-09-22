import type { AuthResponse, PluginClientStatus } from "../api/client";
import type { SettingsTab } from "../navSlug";
import { Adapters } from "./Adapters";
import { PluginPanel } from "./PluginPanel";
import { Settings } from "./Settings";
import { UsersAuth } from "./UsersAuth";

const SETTINGS_TAB_ITEMS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "设置" },
  { id: "plugins", label: "插件管理" },
  { id: "adapters", label: "站点适配器" },
  { id: "users", label: "用户与授权" },
];

interface SystemSettingsProps {
  tab: SettingsTab | null;
  onTabChange: (tab: SettingsTab) => void;
  session: AuthResponse | null;
  onSessionChange: (session: AuthResponse | null) => void;
  onPluginStatusChange: (clients: PluginClientStatus[]) => void;
}

export function SystemSettings({ tab, onTabChange, session, onSessionChange, onPluginStatusChange }: SystemSettingsProps) {
  const activeTab = tab ?? "general";

  return (
    <section className="stacked-page">
      <article className="panel">
        <div className="panel-header">
          <h2>系统设置</h2>
        </div>
        <p>插件接入、站点适配器、用户授权与本地运行配置。</p>
        <div className="settings-tabs" role="tablist">
          {SETTINGS_TAB_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              data-active={activeTab === item.id ? "yes" : "no"}
              onClick={() => onTabChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </article>
      {activeTab === "general" ? <Settings /> : null}
      {activeTab === "plugins" ? <PluginPanel onStatusChange={onPluginStatusChange} /> : null}
      {activeTab === "adapters" ? <Adapters /> : null}
      {activeTab === "users" ? <UsersAuth session={session} onSessionChange={onSessionChange} /> : null}
    </section>
  );
}
