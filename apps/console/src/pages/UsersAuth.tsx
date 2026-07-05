import { useState } from "react";
import { updateMe, type AuthResponse } from "../api/client";

export function UsersAuth({ session, onSessionChange }: { session: AuthResponse | null; onSessionChange: (session: AuthResponse | null) => void }) {
  const [username, setUsername] = useState(session?.user.username ?? "");
  const [displayName, setDisplayName] = useState(session?.user.display_name ?? "");
  const [message, setMessage] = useState("");

  async function saveProfile() {
    if (!session) return;
    try {
      const user = await updateMe({ username, display_name: displayName }, session.token);
      const nextSession = { ...session, user };
      localStorage.setItem("learn_assistant_session", JSON.stringify(nextSession));
      onSessionChange(nextSession);
      setMessage("用户信息已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  }

  return (
    <section className="stacked-page">
      <article className="panel">
        <h2>用户与授权</h2>
        <p>{session ? `当前用户：${session.user.display_name} (${session.user.email})` : "请先在左侧登录或注册本地账号。"}</p>
      </article>
      {session ? (
        <article className="panel">
          <h2>用户信息</h2>
          <form className="inline-form">
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名，可用于登录" />
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="显示名称" />
            <button type="button" onClick={() => void saveProfile()}>保存用户信息</button>
          </form>
          {message ? <p>{message}</p> : null}
        </article>
      ) : null}
    </section>
  );
}
