import type { AuthResponse } from "../api/client";

export function UsersAuth({ session }: { session: AuthResponse | null }) {
  return (
    <section className="stacked-page">
      <article className="panel">
        <h2>用户与授权</h2>
        <p>{session ? `当前用户：${session.user.display_name} (${session.user.email})` : "请先在左侧登录或注册本地账号。"}</p>
      </article>
    </section>
  );
}
