import { useEffect, useState } from "react";
import { API_BASE_URL, createPluginToken, downloadExtensionPackage, fetchPluginStatus, fetchVideoEvents, type PluginClientStatus, type VideoEventItem } from "../api/client";
import { getSubtitleDiagnostics } from "./pluginDiagnostics";
import { startPluginStatusPolling } from "./pluginPolling";

interface PluginPanelProps {
  onStatusChange?: (clients: PluginClientStatus[]) => void;
}

export function PluginPanel({ onStatusChange }: PluginPanelProps) {
  const [clients, setClients] = useState<PluginClientStatus[]>([]);
  const [videoEvents, setVideoEvents] = useState<VideoEventItem[]>([]);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("插件未绑定时，请先生成 Token 并填入扩展选项页。");

  async function refreshStatus() {
    try {
      const [status, events] = await Promise.all([fetchPluginStatus(), fetchVideoEvents()]);
      setClients(status.clients);
      setVideoEvents(events.items);
      onStatusChange?.(status.clients);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件状态读取失败");
    }
  }

  async function handleCreateToken() {
    try {
      const result = await createPluginToken("Edge local");
      setToken(result.token);
      setClients((current) => {
        const nextClients = [result.client, ...current.filter((client) => client.id !== result.client.id)];
        onStatusChange?.(nextClients);
        return nextClients;
      });
      setMessage("Token 只显示一次，请填入扩展选项页并保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Token 生成失败");
    }
  }

  async function handleDownloadPackage() {
    try {
      const blob = await downloadExtensionPackage();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "learning-assistant-extension.zip";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("插件包已导出，请在 Edge 扩展页面加载或安装。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件包导出失败");
    }
  }

  useEffect(() => {
    return startPluginStatusPolling(() => void refreshStatus());
  }, []);

  return (
    <article className="plugin-panel">
      <h2>插件管理</h2>
      <p>API 地址: <code>{API_BASE_URL}</code></p>
      <div className="plugin-actions">
        <button type="button" onClick={handleCreateToken}>生成插件 Token</button>
        <button type="button" onClick={() => void handleDownloadPackage()}>导出插件包</button>
        <button type="button" onClick={() => void refreshStatus()}>刷新状态</button>
      </div>
      <p>浏览器不允许网页静默安装扩展。导出 zip 后，在 Edge 扩展管理页开启开发人员模式并加载解压后的插件目录。</p>
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
      <section className="video-source-list">
        <h3>最近视频源</h3>
        {videoEvents.filter((event) => event.event_type !== "subtitle-diagnostic").length === 0 ? <p>暂无视频源采集记录。</p> : videoEvents.filter((event) => event.event_type !== "subtitle-diagnostic").slice(0, 5).map((event) => {
          const source = event.video_source;
          const currentSrc = typeof source.currentSrc === "string" ? source.currentSrc : "未上报";
          const mediaType = typeof source.mediaType === "string" ? source.mediaType : "unknown";
          const isBlob = source.isBlob === true ? "是" : "否";
          const isLikelySigned = source.isLikelySigned === true ? "是" : "否";
          return (
            <section key={event.id} className="plugin-client-row">
              <strong>{mediaType.toUpperCase()} · {event.event_type}</strong>
              <span>时间: {event.video_time_seconds ?? "-"}</span>
              <span>Blob: {isBlob}</span>
              <span>疑似签名: {isLikelySigned}</span>
              <span className="breakable">地址: {currentSrc}</span>
              <span className="breakable">页面: {event.course_url || "-"}</span>
            </section>
          );
        })}
      </section>
      <section className="video-source-list">
        <h3>最近字幕采集</h3>
        {getSubtitleDiagnostics(videoEvents).length === 0 ? <p>暂无字幕采集诊断。</p> : getSubtitleDiagnostics(videoEvents).slice(0, 5).map((diagnostic) => (
          <section key={diagnostic.id} className="plugin-client-row">
            <strong>{diagnostic.status}</strong>
            <span>{diagnostic.detail}</span>
            <span className="breakable">字幕: {diagnostic.subtitleUrl}</span>
          </section>
        ))}
      </section>
    </article>
  );
}
