import { useState, type ReactNode } from "react";
import { ApiError, login, register, type AuthResponse, type UserProfile } from "../api/client";
import { AuthBackground } from "../components/AuthBackground";
import { Logo } from "../components/icons";

interface AuthPanelProps {
  session: AuthResponse | null;
  onSessionChange: (session: AuthResponse | null) => void;
}

interface Feature {
  title: string;
  desc: string;
  icon: ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: "浏览器插件托管",
    desc: "后台生成 Token、导出插件包，统一绑定 API、站点适配器和在线状态。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <path d="M3 8.5h18" />
        <circle cx="6.2" cy="6.3" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="9.2" cy="6.3" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: "多站点适配",
    desc: "通过公共 adapter 扩展不同学习平台，避免把能力写死到单一网站。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.6" />
        <path d="M3.4 12h17.2" />
        <path d="M12 3.4c2.6 3.1 2.6 14.1 0 17.2M12 3.4c-2.6 3.1-2.6 14.1 0 17.2" />
      </svg>
    ),
  },
  {
    title: "私有化部署",
    desc: "支持本地或远端数据库，适合交付给学校、企业和团队内网使用。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.4" y="4" width="17.2" height="6.4" rx="2.2" />
        <rect x="3.4" y="13.6" width="17.2" height="6.4" rx="2.2" />
        <circle cx="7.2" cy="7.2" r="0.95" fill="currentColor" stroke="none" />
        <circle cx="7.2" cy="16.8" r="0.95" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

const FIELD_ICON = "auth-input-icon";

function MailIcon() {
  return (
    <svg className={FIELD_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.6 7.2 12 13l8.4-5.8" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className={FIELD_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className={FIELD_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.6" y="10" width="14.8" height="10" rx="2.6" />
      <path d="M8.2 10V7.6a3.8 3.8 0 0 1 7.6 0V10" />
    </svg>
  );
}

export function AuthPanel({ session, onSessionChange }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [account, setAccount] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const result = mode === "login"
        ? await login({ account, password })
        : await register({ email, password, display_name: displayName || email });
      localStorage.setItem("learn_assistant_session", JSON.stringify(result));
      onSessionChange(result);
    } catch (error) {
      if (mode === "register" && error instanceof ApiError && error.status === 403) {
        setMessage("注册未开放，请联系管理员开通账号");
      } else if (error instanceof ApiError && error.status === 429) {
        setMessage("尝试次数过多，请稍后再试");
      } else {
        setMessage(error instanceof Error ? error.message : "认证失败");
      }
      setSubmitting(false);
    }
  }

  if (session) {
    const user: UserProfile = session.user;
    return (
      <section className="auth-panel">
        <strong>{user.display_name}</strong>
        <span>{user.email}</span>
        <button type="button" onClick={() => { localStorage.removeItem("learn_assistant_session"); onSessionChange(null); }}>退出</button>
      </section>
    );
  }

  return (
    <>
      <AuthBackground />
      <section className="auth-landing">
        <div className="auth-commercial">
          <div className="brand-lockup">
            <Logo size={40} className="auth-logo" />
            <div className="brand-text">
              <strong>学习助手</strong>
              <span>Learning Assistant Platform</span>
            </div>
          </div>

          <h1>
            机构在线学习<em>数据中台</em>
          </h1>

          <p className="auth-lead">
            面向教育机构、企业培训和私有化项目，统一管理课程采集、字幕沉淀、学习笔记、插件接入和导出交付。
          </p>

          <div className="commercial-points" aria-label="平台能力">
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <span className="point-icon">{feature.icon}</span>
                <strong>{feature.title}</strong>
                <span>{feature.desc}</span>
              </article>
            ))}
          </div>

          <div className="commercial-stats" aria-label="平台模块">
            <span><strong>插件</strong> 管理</span>
            <span><strong>字幕</strong> 归档</span>
            <span><strong>笔记</strong> 协作</span>
          </div>
        </div>

        <form
          className="auth-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="auth-panel-head">
            <span className="auth-panel-badge"><Logo size={24} /></span>
            <div>
              <h2>{mode === "login" ? "登录学习助手" : "创建新账号"}</h2>
              <p>
                {mode === "login"
                  ? "登录后进入管理后台，管理课程资料、字幕、笔记与浏览器插件。"
                  : "注册后即可进入管理后台，账号权限由管理员分配。"}
              </p>
            </div>
          </div>

          <div className="segmented auth-seg" data-mode={mode} role="tablist">
            <span className="auth-seg-thumb" aria-hidden="true" />
            <button type="button" role="tab" aria-selected={mode === "login"} data-active={mode === "login" ? "yes" : "no"} onClick={() => { setMode("login"); setMessage(""); }}>
              <svg className="auth-seg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 3.5h4A1.5 1.5 0 0 1 20 5v14a1.5 1.5 0 0 1-1.5 1.5h-4" />
                <path d="M10 16.5 14.5 12 10 7.5" />
                <path d="M14.5 12H3.5" />
              </svg>
              登录
            </button>
            <button type="button" role="tab" aria-selected={mode === "register"} data-active={mode === "register" ? "yes" : "no"} onClick={() => { setMode("register"); setMessage(""); }}>
              <svg className="auth-seg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="10" cy="8" r="3.4" />
                <path d="M3.6 19.6a6.4 6.4 0 0 1 12.8 0" />
                <path d="M18.6 6.4v5M16.1 8.9h5" />
              </svg>
              注册
            </button>
          </div>

          <label className="auth-field">
            <span>{mode === "login" ? "邮箱或用户名" : "邮箱"}</span>
            <span className="auth-input">
              <MailIcon />
              <input
                value={mode === "login" ? account : email}
                onChange={(event) => (mode === "login" ? setAccount(event.target.value) : setEmail(event.target.value))}
                placeholder="you@example.com"
                autoComplete={mode === "login" ? "username" : "email"}
              />
            </span>
          </label>

          {mode === "register" ? (
            <label className="auth-field">
              <span>显示名称</span>
              <span className="auth-input">
                <UserIcon />
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="后台展示的名称"
                  autoComplete="nickname"
                />
              </span>
            </label>
          ) : null}

          <label className="auth-field">
            <span>密码</span>
            <span className="auth-input">
              <LockIcon />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "login" ? "请输入密码" : "至少 6 位"}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </span>
          </label>

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? (
              <>
                <span className="auth-spinner" aria-hidden="true" />
                {mode === "login" ? "登录中…" : "注册中…"}
              </>
            ) : mode === "login" ? "登录" : "注册"}
          </button>

          {message ? <p className="auth-message" role="alert">{message}</p> : null}

          <p className="auth-footnote" title="账号由安装器创建的管理员分配，登录凭证仅保存在本机浏览器">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4.6" y="10" width="14.8" height="10" rx="2.6" />
              <path d="M8.2 10V7.6a3.8 3.8 0 0 1 7.6 0V10" />
            </svg>
            登录凭证仅保存在本机浏览器
          </p>
        </form>
      </section>
    </>
  );
}
