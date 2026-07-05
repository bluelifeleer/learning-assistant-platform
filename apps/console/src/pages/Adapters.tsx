import { useEffect, useState } from "react";
import { fetchAdapters, saveAdapter, type AdapterItem } from "../api/client";

export function Adapters() {
  const [items, setItems] = useState<AdapterItem[]>([]);
  const [adapterId, setAdapterId] = useState("generic-video");
  const [name, setName] = useState("Generic Video");
  const [status, setStatus] = useState("enabled");
  const [hosts, setHosts] = useState("*.example.com");
  const [message, setMessage] = useState("正在读取适配器...");

  function loadAdapters() {
    return fetchAdapters()
      .then((result) => {
        setItems(result.items);
        setMessage(result.items.length ? "" : "暂无站点适配器记录，采集课程后会自动创建。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "适配器读取失败"));
  }

  useEffect(() => {
    void loadAdapters();
  }, []);

  async function handleSave() {
    try {
      const hostList = hosts.split(/[\n,]/).map((host) => host.trim()).filter(Boolean);
      await saveAdapter({ adapter_id: adapterId, name, status, host_patterns: { hosts: hostList } });
      setMessage("适配器已保存");
      await loadAdapters();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "适配器保存失败");
    }
  }

  function edit(item: AdapterItem) {
    const hostPatterns = item.host_patterns as { hosts?: string[] };
    setAdapterId(item.adapter_id);
    setName(item.name);
    setStatus(item.status);
    setHosts(Array.isArray(hostPatterns.hosts) ? hostPatterns.hosts.join("\n") : JSON.stringify(item.host_patterns));
  }

  return (
    <section className="stacked-page">
      <article className="panel">
        <h2>站点适配器</h2>
        <p>维护可被插件启用的公共 adapter，按域名规则匹配不同学习平台。</p>
      </article>
      <article className="panel">
        <h2>新增适配器</h2>
        <form className="inline-form adapter-form">
          <input value={adapterId} onChange={(event) => setAdapterId(event.target.value)} placeholder="adapter id，例如 generic-video" />
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="适配器名称" />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
          <textarea value={hosts} onChange={(event) => setHosts(event.target.value)} placeholder="域名规则，每行一个，例如 *.example.com" />
          <button type="button" onClick={() => void handleSave()}>保存适配器</button>
        </form>
        {message ? <p>{message}</p> : null}
      </article>
      <article className="panel">
        <h2>适配器列表</h2>
        <div className="data-table">
          <div><strong>名称</strong><strong>Adapter</strong><strong>状态</strong><strong>域名</strong><strong>操作</strong></div>
          {items.map((item) => (
            <div key={item.id}>
              <span>{item.name}</span>
              <span>{item.adapter_id}</span>
              <span>{item.status}</span>
              <span>{JSON.stringify(item.host_patterns)}</span>
              <button type="button" className="text-button" onClick={() => edit(item)}>编辑</button>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
