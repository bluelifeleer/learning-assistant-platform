import { useEffect, useState } from "react";
import { fetchSettings, updateSettings, type WorkspaceSettings } from "../api/client";

interface SettingsProps {
  title?: string;
  description?: string;
}

export function Settings({ title = "系统设置", description = "维护组织信息、授权状态和本地运行配置。" }: SettingsProps) {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [message, setMessage] = useState("正在读取系统设置...");

  function applySettings(next: WorkspaceSettings) {
    setSettings(next);
    setOrganizationName(next.organization_name);
    setLicenseKey(next.license_key ?? "");
  }

  useEffect(() => {
    void fetchSettings()
      .then((result) => {
        applySettings(result);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "设置读取失败"));
  }, []);

  async function save() {
    try {
      const result = await updateSettings({ organization_name: organizationName, license_key: licenseKey });
      applySettings(result);
      setMessage("设置已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "设置保存失败");
    }
  }

  return (
    <section className="stacked-page">
      <article className="panel">
        <h2>{title}</h2>
        <p>{description}</p>
      </article>
      <article className="panel">
        <h2>组织与授权</h2>
        <form className="inline-form">
          <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="组织名称" />
          <input value={licenseKey} onChange={(event) => setLicenseKey(event.target.value)} placeholder="License Key" />
          <button type="button" onClick={() => void save()}>保存设置</button>
        </form>
        {message ? <p>{message}</p> : null}
      </article>
      <article className="panel">
        <h2>运行配置</h2>
        <div className="data-table settings-table">
          <div><strong>项目</strong><strong>值</strong></div>
          <div><span>API 地址</span><span>{settings?.api_base_url ?? "读取中"}</span></div>
          <div><span>数据库类型</span><span>{settings?.database_type ?? "读取中"}</span></div>
          <div><span>导出目录</span><span>{settings?.export_dir ?? "读取中"}</span></div>
          <div><span>授权状态</span><span>{settings?.license_status ?? "读取中"}</span></div>
        </div>
      </article>
    </section>
  );
}
