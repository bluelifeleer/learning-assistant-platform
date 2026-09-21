import { useEffect, useState } from "react";
import { fetchAdapters, saveAdapter, type AdapterItem } from "../api/client";
import { Modal } from "../components/Modal";

function hostPatternsOf(item: AdapterItem): string[] {
  const hosts = (item.host_patterns as { hosts?: unknown }).hosts;
  return Array.isArray(hosts) ? hosts.filter((host): host is string => typeof host === "string") : [];
}

export function Adapters() {
  const [items, setItems] = useState<AdapterItem[]>([]);
  const [adapterId, setAdapterId] = useState("generic-video");
  const [name, setName] = useState("Generic Video");
  const [status, setStatus] = useState("enabled");
  const [hosts, setHosts] = useState("*.example.com");
  const [message, setMessage] = useState("正在读取适配器...");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

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

  function resetForm() {
    setAdapterId("generic-video");
    setName("Generic Video");
    setStatus("enabled");
    setHosts("*.example.com");
  }

  function openCreate() {
    resetForm();
    setEditorMode("create");
    setFormError("");
    setEditorOpen(true);
  }

  function openEdit(item: AdapterItem) {
    const hostList = hostPatternsOf(item);
    setAdapterId(item.adapter_id);
    setName(item.name);
    setStatus(item.status);
    setHosts(hostList.length ? hostList.join("\n") : JSON.stringify(item.host_patterns));
    setEditorMode("edit");
    setFormError("");
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setFormError("");
  }

  async function handleSave() {
    setSaving(true);
    setFormError("");
    try {
      const hostList = hosts.split(/[\n,]/).map((host) => host.trim()).filter(Boolean);
      await saveAdapter({ adapter_id: adapterId, name, status, host_patterns: { hosts: hostList } });
      closeEditor();
      setMessage("适配器已保存");
      await loadAdapters();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "适配器保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="stacked-page">
      <article className="panel">
        <div className="panel-header">
          <h2>站点适配器</h2>
          <button type="button" className="primary-button" onClick={openCreate}>新增适配器</button>
        </div>
        <p>维护可被插件启用的公共 adapter，按域名规则匹配不同学习平台。</p>
        {message ? <p>{message}</p> : null}
      </article>
      <article className="panel">
        <h2>适配器列表</h2>
        <div className="data-table adapter-table">
          <div><strong>名称</strong><strong>Adapter</strong><strong>状态</strong><strong>域名</strong><strong>操作</strong></div>
          {items.map((item) => {
            const hostList = hostPatternsOf(item);
            return (
              <div key={item.id}>
                <span>{item.name}</span>
                <span className="mono-dim">{item.adapter_id}</span>
                <span>
                  <span className="pill" data-tone={item.status === "enabled" ? "ok" : "muted"}>
                    {item.status === "enabled" ? "启用" : "停用"}
                  </span>
                </span>
                <span className="cell-dim" title={JSON.stringify(item.host_patterns)}>
                  {hostList.length ? hostList.join(", ") : "-"}
                </span>
                <span>
                  <button type="button" className="text-button text-button-sm" onClick={() => openEdit(item)}>编辑</button>
                </span>
              </div>
            );
          })}
        </div>
      </article>
      {editorOpen ? (
        <Modal
          title={editorMode === "create" ? "新增适配器" : "编辑适配器"}
          onClose={closeEditor}
          footer={(
            <>
              {formError ? <span className="form-error">{formError}</span> : null}
              <button type="button" className="text-button" onClick={closeEditor}>取消</button>
              <button type="button" className="primary-button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? "保存中..." : "保存适配器"}
              </button>
            </>
          )}
        >
          <label className="modal-field">
            <span>Adapter ID</span>
            <input value={adapterId} onChange={(event) => setAdapterId(event.target.value)} placeholder="例如 generic-video" />
          </label>
          <label className="modal-field">
            <span>适配器名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 Generic Video" />
          </label>
          <label className="modal-field">
            <span>状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
          <label className="modal-field">
            <span>域名规则</span>
            <textarea value={hosts} onChange={(event) => setHosts(event.target.value)} placeholder="每行一个，例如 *.example.com" rows={4} />
          </label>
        </Modal>
      ) : null}
    </section>
  );
}
