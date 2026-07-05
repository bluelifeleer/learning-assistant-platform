import { useEffect, useState } from "react";
import { API_BASE_URL, createPluginToken, fetchPluginStatus, type PluginClientStatus } from "../api/client";
import { startPluginStatusPolling } from "./pluginPolling";

export function PluginPanel() {
  const [clients, setClients] = useState<PluginClientStatus[]>([]);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("插件未绑定时，请先生成 Token 并填入扩展选项页。");

  async function refreshStatus() {
    try {
      const status = await fetchPluginStatus();
      setClients(status.clients);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件状态读取失败");
    }
  }

  async function handleCreateToken() {
    try {
      const result = await createPluginToken("Edge local");
      setToken(result.token);
      setClients((current) => [result.client, ...current.filter((client) => client.id !== result.client.id)]);
      setMessage("Token 只显示一次，请填入扩展选项页并保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Token 生成失败");
    }
  }

  useEffect(() => {
    return startPluginStatusPolling(() => void refreshStatus());
  }, []);

  return (
    <article className="plugin-panel">
      <h2>插件绑定</h2>
      <p>API 地址: <code>{API_BASE_URL}</code></p>
      <div className="plugin-actions">
        <button type="button" onClick={handleCreateToken}>生成插件 Token</button>
        <button type="button" onClick={() => void refreshStatus()}>刷新状态</button>
      </div>
      {token ? <pre className="token-box">{token}</pre> : null}
      <p>{message}</p>
      <div className="plugin-client-list">
        {clients.length === 0 ? <p>暂无插件在线记录。</p> : clients.map((client) => (
          <section key={client.id} className="plugin-client-row">
            <strong>{client.name}</strong>
            <span data-online={client.online ? "yes" : "no"}>{client.online ? "在线" : "离线"}</span>
            <span>Adapter: {client.adapter_name || client.adapter_id || "未上报"}</span>
            <span>最近页面: {client.current_url || "未上报"}</span>
            <span>启用: {client.enabled_adapters.join(", ") || "未配置"}</span>
          </section>
        ))}
      </div>
    </article>
  );
}
