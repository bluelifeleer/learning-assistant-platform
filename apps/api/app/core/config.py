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

    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
