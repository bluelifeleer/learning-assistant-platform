from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 17890
    database_type: str = "postgresql"
    database_url: str = "postgresql+psycopg://learn_assistant:learn_assistant@127.0.0.1:5432/learn_assistant"
    default_org_name: str = "Local Workspace"
    api_token_pepper: str = "change-me-token-pepper"
    export_dir: str = "exports"
    screenshots_dir: str = "screenshots"
    note_images_dir: str = "note_images"
    allow_registration: bool = False
    digest_scheduler_enabled: bool = True
    digest_scheduler_interval_seconds: int = 900
    # 大模型请求的 TLS / 代理选项:
    # - llm_ca_bundle: 额外信任的 CA bundle 路径(本机开了 Charles / mitmproxy /
    #   Fiddler 这类抓包代理时,它们用自己的根证书重签 TLS,Python 默认不信任)
    # - llm_disable_proxy: 忽略系统代理直连,适合「代理只为抓包、并不需要出网代理」的场景
    llm_ca_bundle: str | None = None
    llm_disable_proxy: bool = False
    # 导出文件保留策略:两项都为 0 表示永久保留
    # 例:export_retention_count=50 只留最近 50 份;export_retention_days=30 删 30 天前的
    export_retention_days: int = 0
    export_retention_count: int = 0
    export_cleanup_enabled: bool = True
    export_cleanup_interval_seconds: int = 3600
    # 启动时把「还处于进行中」的导入/导出任务判为中断的宽限期(秒)。
    # 单进程部署保持 0;多 worker 部署要调大到大于最长任务耗时,否则会误判别的 worker。
    job_recovery_grace_seconds: int = 0

    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


#: 安装向导会随机生成 pepper；这两个值说明还没生成过
INSECURE_PEPPERS = frozenset({"", "change-me-token-pepper"})
SAFE_ENVS = frozenset({"development", "test"})


def ensure_safe_config(settings: Settings | None = None) -> None:
    """生产环境启动前自检，避免用默认密钥跑起来。

    开发/测试环境直接放行（本地 `.env` 里的默认值就是为了方便）。
    容器部署时 `APP_ENV=production`，这里不通过会直接启动失败并打印原因。
    """
    effective = settings or get_settings()
    if effective.app_env in SAFE_ENVS:
        return
    problems: list[str] = []
    pepper = (effective.api_token_pepper or "").strip()
    if pepper in INSECURE_PEPPERS:
        problems.append("API_TOKEN_PEPPER 仍是默认值（用 `openssl rand -hex 32` 生成一个）")
    elif len(pepper) < 16:
        problems.append("API_TOKEN_PEPPER 太短，至少 16 位随机串")
    if problems:
        raise RuntimeError("生产环境配置不安全：" + "；".join(problems))
