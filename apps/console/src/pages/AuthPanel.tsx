import { useState } from "react";
import { login, register, type AuthResponse, type UserProfile } from "../api/client";

interface AuthPanelProps {
  session: AuthResponse | null;
  onSessionChange: (session: AuthResponse | null) => void;
}

export function AuthPanel({ session, onSessionChange }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    try {
      const result = mode === "login"
        ? await login({ email, password })
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
    <section className="auth-panel">
      <div className="segmented">
        <button type="button" data-active={mode === "login" ? "yes" : "no"} onClick={() => setMode("login")}>登录</button>
        <button type="button" data-active={mode === "register" ? "yes" : "no"} onClick={() => setMode("register")}>注册</button>
      </div>
      <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" />
      {mode === "register" ? <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="显示名称" /> : null}
      <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码" type="password" />
      <button type="button" onClick={() => void submit()}>{mode === "login" ? "登录" : "注册"}</button>
      {message ? <span>{message}</span> : null}
    </section>
  );
}
