from typing import Literal

from pydantic import BaseModel, Field, field_validator


DatabaseType = Literal["postgresql", "mysql"]


def _reject_env_metachars(value: str, field: str) -> str:
    """拒绝会被写入 .env 的字段中的换行/等号,防止注入新的环境变量键。"""
    stripped = value.strip()
    if any(ch in stripped for ch in "\r\n="):
        raise ValueError(f"{field} 不能包含换行或等号字符")
    return stripped


class DatabaseConfigIn(BaseModel):
    database_type: DatabaseType
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(gt=0, le=65535)
    database: str = Field(min_length=1, max_length=128)
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(max_length=512)

    @field_validator("host")
    @classmethod
    def _validate_host(cls, value: str) -> str:
        host = value.strip()
        if not host:
            raise ValueError("host 不能为空")
        if any(ch in host for ch in "\r\n\t @/#?\\"):
            raise ValueError("host 包含非法字符")
        return host


class SetupInitializeIn(BaseModel):
    organization_name: str = Field(min_length=1, max_length=200)
    admin_email: str = Field(min_length=3, max_length=320)
    admin_password: str = Field(min_length=6, max_length=128)
    license_key: str | None = Field(default=None, max_length=200)
    database: DatabaseConfigIn
    initialize_schema: bool = True

    @field_validator("organization_name")
    @classmethod
    def _validate_organization_name(cls, value: str) -> str:
        return _reject_env_metachars(value, "organization_name")


class SetupStatusOut(BaseModel):
    installed: bool
    env_exists: bool
    database_configured: bool
    database_connected: bool
    schema_initialized: bool
    previously_installed: bool = False
    database_type: str | None = None
    next_step: str
    error: str | None = None


class DatabaseTestOut(BaseModel):
    ok: bool
    database_url: str
    error: str | None = None
