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

    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
