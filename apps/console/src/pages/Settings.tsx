import { useEffect, useRef, useState } from "react";
import {
  fetchAiSettings,
  fetchEmailSettings,
  fetchSettings,
  sendDigestEmail,
  testAiConnection,
  testEmailSettings,
  updateAiSettings,
  updateEmailSettings,
  updateSettings,
  type AISettings,
  type DigestFrequency,
  type EmailSettings,
  type WorkspaceSettings,
} from "../api/client";
import { aiActionErrorMessage, startAiTaskPolling } from "./aiTasks";
import { toast } from "../components/toast";

interface SettingsProps {
  title?: string;
  description?: string;
}

function AiSettingsPanel() {
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("正在读取 AI 设置...");
  const [testMessage, setTestMessage] = useState("");

  function applyAiSettings(next: AISettings) {
    setAiSettings(next);
    setBaseUrl(next.llm_base_url ?? "");
    setModel(next.llm_model ?? "");
    setAutoGenerate(next.ai_auto_generate);
    setApiKey("");
  }

  useEffect(() => {
    void fetchAiSettings()
      .then((result) => {
        applyAiSettings(result);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "AI 设置读取失败"));
  }, []);

  async function save() {
    setSaving(true);
    setTestMessage("");
    try {
      const result = await updateAiSettings({
        llm_base_url: baseUrl,
        llm_model: model,
        ai_auto_generate: autoGenerate,
        ...(apiKey ? { llm_api_key: apiKey } : {}),
      });
      applyAiSettings(result);
      setMessage("AI 设置已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearApiKey() {
    setSaving(true);
    setTestMessage("");
    try {
      const result = await updateAiSettings({ llm_api_key: "" });
      applyAiSettings(result);
      setMessage("API Key 已清除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "API Key 清除失败");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestMessage("");
    try {
      const result = await testAiConnection();
      setTestMessage(result.ok ? "连接成功" : `连接失败：${result.detail ?? "未知原因"}`);
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : "连接测试失败");
    } finally {
      setTesting(false);
    }
  }

  return (
    <article className="panel">
      <h2>AI 设置</h2>
      <p>配置大模型服务，用于章节摘要、自动出题与闪卡生成。当前状态：{aiSettings ? (aiSettings.configured ? "已配置" : "未配置") : "读取中"}</p>
      <form className="inline-form">
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.deepseek.com/v1" />
        <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="模型名，如 deepseek-chat" />
      </form>
      <form className="inline-form">
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={aiSettings?.api_key_masked ? `已配置：${aiSettings.api_key_masked}（留空不修改）` : "API Key"}
        />
        {aiSettings?.api_key_masked ? (
          <button type="button" className="text-button" disabled={saving} onClick={() => void clearApiKey()}>清除 Key</button>
        ) : null}
      </form>
      <label className="filter-item">
        <input type="checkbox" checked={autoGenerate} onChange={(event) => setAutoGenerate(event.target.checked)} />
        <span>新章节自动生成（字幕采集后自动生成摘要/闪卡）</span>
      </label>
      <div className="inline-form">
        <button type="button" disabled={saving} onClick={() => void save()}>{saving ? "保存中..." : "保存 AI 设置"}</button>
        <button type="button" className="text-button" disabled={testing || !aiSettings?.configured} onClick={() => void testConnection()}>
          {testing ? "测试中..." : "测试连接"}
        </button>
      </div>
      {testMessage ? <p>{testMessage}</p> : null}
      {message ? <p>{message}</p> : null}
    </article>
  );
}

function EmailSettingsPanel() {
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [digestAuto, setDigestAuto] = useState(false);
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>("daily");
  const [digestHour, setDigestHour] = useState("8");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [message, setMessage] = useState("正在读取邮箱设置...");
  const digestPollStop = useRef<(() => void) | null>(null);

  function applyEmailSettings(next: EmailSettings) {
    setEmailSettings(next);
    setSmtpHost(next.smtp_host ?? "");
    setSmtpPort(String(next.smtp_port ?? 465));
    setSmtpUsername(next.smtp_username ?? "");
    setEmailFrom(next.email_from ?? "");
    setEmailTo(next.email_to ?? "");
    setDigestAuto(next.digest_auto);
    setDigestFrequency(next.digest_frequency);
    setDigestHour(String(next.digest_hour));
    setSmtpPassword("");
  }

  useEffect(() => {
    void fetchEmailSettings()
      .then((result) => {
        applyEmailSettings(result);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "邮箱设置读取失败"));
    return () => digestPollStop.current?.();
  }, []);

  async function save() {
    const port = Number.parseInt(smtpPort, 10);
    const hour = Number.parseInt(digestHour, 10);
    if (!Number.isFinite(port) || port <= 0) {
      setMessage("SMTP 端口需为正整数");
      return;
    }
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      setMessage("发送小时需为 0-23 的整数");
      return;
    }
    setSaving(true);
    try {
      const result = await updateEmailSettings({
        smtp_host: smtpHost,
        smtp_port: port,
        smtp_username: smtpUsername,
        email_from: emailFrom,
        email_to: emailTo,
        digest_auto: digestAuto,
        digest_frequency: digestFrequency,
        digest_hour: hour,
        ...(smtpPassword ? { smtp_password: smtpPassword } : {}),
      });
      applyEmailSettings(result);
      setMessage("邮箱设置已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "邮箱设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearPassword() {
    setSaving(true);
    try {
      const result = await updateEmailSettings({ smtp_password: "" });
      applyEmailSettings(result);
      setMessage("SMTP 密码已清除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SMTP 密码清除失败");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const result = await testEmailSettings();
      if (result.ok) {
        toast.success("测试邮件发送成功");
      } else {
        toast.error(`发送失败：${result.detail ?? "未知原因"}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试邮件发送失败");
    } finally {
      setTesting(false);
    }
  }

  function sendDigestNow() {
    setDigestSending(true);
    void sendDigestEmail()
      .then((created) => {
        digestPollStop.current?.();
        digestPollStop.current = startAiTaskPolling(created.task_id, {
          onSettled: (task) => {
            digestPollStop.current = null;
            setDigestSending(false);
            if (task.status === "failed") {
              toast.error(task.error || "总结邮件发送失败");
            } else {
              toast.success("总结邮件已发送");
            }
          },
          onError: (error) => {
            digestPollStop.current = null;
            setDigestSending(false);
            toast.error(aiActionErrorMessage(error, "任务状态查询失败"));
          },
        });
      })
      .catch((error: unknown) => {
        setDigestSending(false);
        toast.error(error instanceof Error ? error.message : "总结邮件任务创建失败");
      });
  }

  return (
    <article className="panel">
      <h2>邮箱设置</h2>
      <p>配置 SMTP 服务，用于发送笔记和学习总结邮件。当前状态：{emailSettings ? (emailSettings.configured ? "已配置" : "未配置") : "读取中"}</p>
      <form className="inline-form">
        <input value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} placeholder="SMTP 主机，如 smtp.qq.com" />
        <input value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} placeholder="端口（默认 465）" />
      </form>
      <form className="inline-form">
        <input value={smtpUsername} onChange={(event) => setSmtpUsername(event.target.value)} placeholder="SMTP 用户名" />
        <input value={emailFrom} onChange={(event) => setEmailFrom(event.target.value)} placeholder="发件人地址" />
        <input value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder="收件邮箱" />
      </form>
      <form className="inline-form">
        <input
          type="password"
          value={smtpPassword}
          onChange={(event) => setSmtpPassword(event.target.value)}
          placeholder={emailSettings?.password_masked ? `已配置：${emailSettings.password_masked}（留空不修改）` : "SMTP 密码 / 授权码"}
        />
        {emailSettings?.password_masked ? (
          <button type="button" className="text-button" disabled={saving} onClick={() => void clearPassword()}>清除密码</button>
        ) : null}
      </form>
      <label className="filter-item">
        <input type="checkbox" checked={digestAuto} onChange={(event) => setDigestAuto(event.target.checked)} />
        <span>自动发送学习总结</span>
      </label>
      <form className="inline-form">
        <select value={digestFrequency} onChange={(event) => setDigestFrequency(event.target.value as DigestFrequency)}>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
        </select>
        <input type="number" min={0} max={23} value={digestHour} onChange={(event) => setDigestHour(event.target.value)} placeholder="发送小时（0-23）" />
      </form>
      <p>上次发送学习总结：{emailSettings?.last_digest_at ?? "尚未发送"}</p>
      <div className="inline-form">
        <button type="button" disabled={saving} onClick={() => void save()}>{saving ? "保存中..." : "保存邮箱设置"}</button>
        <button type="button" className="text-button" disabled={testing || !emailSettings?.configured} onClick={() => void sendTest()}>
          {testing ? "发送中..." : "发送测试邮件"}
        </button>
      </div>
      {message ? <p>{message}</p> : null}
      <div className="inline-form">
        <button type="button" disabled={digestSending || !emailSettings?.configured} onClick={sendDigestNow}>
          {digestSending ? "发送中..." : "立即发送学习总结"}
        </button>
      </div>
    </article>
  );
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
        <h2>开放注册</h2>
        <p>注册开关由 API 的 ALLOW_REGISTRATION 环境变量控制，默认关闭。</p>
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
      <AiSettingsPanel />
      <EmailSettingsPanel />
    </section>
  );
}
