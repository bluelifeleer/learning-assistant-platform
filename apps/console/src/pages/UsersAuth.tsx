import { useState } from "react";
import { changePassword, updateMe, type AuthResponse } from "../api/client";
import { Field, PanelHead } from "../components/settingsForm";

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
    <section className="stacked-page settings-page">
      <article className="panel">
        <PanelHead
          title="用户与授权"
          description={
            session
              ? `当前用户：${session.user.display_name}（${session.user.email}）`
              : "请先在左侧登录或注册本地账号。"
          }
        />
        {session ? (
          <>
            <div className="settings-form">
              <div className="field-row field-row-2">
                <Field label="用户名" hint="用于登录，保存后立即生效">
                  <input
                    aria-label="用户名"
                    value={username}
                    autoComplete="username"
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="用户名"
                  />
                </Field>
                <Field label="显示名称">
                  <input
                    aria-label="显示名称"
                    value={displayName}
                    autoComplete="name"
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="显示名称"
                  />
                </Field>
              </div>
            </div>
            {message ? <p className="form-note" role="status">{message}</p> : null}
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={() => void saveProfile()}>保存用户信息</button>
            </div>
          </>
        ) : null}
      </article>

      {session ? (
        <article className="panel">
          <PanelHead title="修改密码" description="修改后下次登录生效，新密码至少 6 位。" />
          <div className="settings-form">
            <div className="field-row field-row-3">
              <Field label="当前密码">
                <input
                  type="password"
                  value={currentPassword}
                  autoComplete="current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="当前密码"
                />
              </Field>
              <Field label="新密码">
                <input
                  type="password"
                  value={newPassword}
                  autoComplete="new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="至少 6 位"
                />
              </Field>
              <Field label="确认新密码">
                <input
                  type="password"
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入新密码"
                />
              </Field>
            </div>
          </div>
          {passwordMessage ? <p className="form-note" role="status">{passwordMessage}</p> : null}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={passwordSaving || !currentPassword || !newPassword}
              onClick={() => void savePassword()}
            >
              {passwordSaving ? "保存中..." : "修改密码"}
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
