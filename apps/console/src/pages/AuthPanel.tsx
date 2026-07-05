import { useState } from "react";
import { login, register, type AuthResponse, type UserProfile } from "../api/client";

interface AuthPanelProps {
  session: AuthResponse | null;
  onSessionChange: (session: AuthResponse | null) => void;
}

export function AuthPanel({ session, onSessionChange }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [account, setAccount] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    try {
      const result = mode === "login"
        ? await login({ account, password })
        : await register({ email, password, display_name: displayName || email });
      localStorage.setItem("learn_assistant_session", JSON.stringify(result));
      onSessionChange(result);
      setMessage("已登录");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "认证失败");
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
    <section className="auth-landing">
      <div className="auth-commercial">
        <p className="eyebrow">Learning Assistant Platform</p>
        <h1>机构在线学习数据中台</h1>
        <p className="auth-lead">
          面向教育机构、企业培训和私有化项目，统一管理课程采集、字幕沉淀、学习笔记、插件接入和导出交付。
        </p>
        <div className="commercial-points" aria-label="平台能力">
          <article>
            <strong>浏览器插件托管</strong>
            <span>后台生成 Token、导出插件包，统一绑定 API、站点适配器和在线状态。</span>
          </article>
          <article>
            <strong>多站点适配</strong>
            <span>通过公共 adapter 扩展不同学习平台，避免把能力写死到单一网站。</span>
          </article>
          <article>
            <strong>私有化部署</strong>
            <span>支持本地或远端数据库，适合交付给学校、企业和团队内网使用。</span>
          </article>
        </div>
        <div className="commercial-stats" aria-label="商业化指标">
          <span><strong>插件</strong> 管理</span>
          <span><strong>字幕</strong> 归档</span>
          <span><strong>笔记</strong> 协作</span>
        </div>
      </div>

      <div className="auth-panel">
        <h2>登录学习助手</h2>
        <p>登录后进入管理后台，管理课程资料、字幕、笔记和浏览器插件。</p>
        <div className="segmented">
          <button type="button" data-active={mode === "login" ? "yes" : "no"} onClick={() => setMode("login")}>登录</button>
          <button type="button" data-active={mode === "register" ? "yes" : "no"} onClick={() => setMode("register")}>注册</button>
        </div>
        <input value={mode === "login" ? account : email} onChange={(event) => (mode === "login" ? setAccount(event.target.value) : setEmail(event.target.value))} placeholder={mode === "login" ? "邮箱或用户名" : "邮箱"} />
        {mode === "register" ? <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="显示名称" /> : null}
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码" type="password" />
        <button type="button" onClick={() => void submit()}>{mode === "login" ? "登录" : "注册"}</button>
        {message ? <span>{message}</span> : null}
      </div>
    </section>
  );
}
