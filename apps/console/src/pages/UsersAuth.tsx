import { useState } from "react";
import { changePassword, updateMe, type AuthResponse } from "../api/client";

export function UsersAuth({ session, onSessionChange }: { session: AuthResponse | null; onSessionChange: (session: AuthResponse | null) => void }) {
  const [username, setUsername] = useState(session?.user.username ?? "");
  const [displayName, setDisplayName] = useState(session?.user.display_name ?? "");
  const [message, setMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

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

  async function savePassword() {
    if (!session) return;
    if (newPassword.length < 6) {
      setPasswordMessage("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("两次输入的新密码不一致");
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage("");
    try {
      await changePassword(currentPassword, newPassword, session.token);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("密码已修改,下次登录请使用新密码");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setPasswordSaving(false);
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
      {session ? (
        <article className="panel">
          <h2>修改密码</h2>
          <form className="inline-form">
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="当前密码"
              autoComplete="current-password"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="新密码(至少 6 位)"
              autoComplete="new-password"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="确认新密码"
              autoComplete="new-password"
            />
            <button type="button" disabled={passwordSaving || !currentPassword || !newPassword} onClick={() => void savePassword()}>
              {passwordSaving ? "保存中..." : "修改密码"}
            </button>
          </form>
          {passwordMessage ? <p>{passwordMessage}</p> : null}
        </article>
      ) : null}
    </section>
  );
}
