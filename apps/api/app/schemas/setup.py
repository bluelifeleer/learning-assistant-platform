from typing import Literal

from pydantic import BaseModel, Field


DatabaseType = Literal["postgresql", "mysql"]


class DatabaseConfigIn(BaseModel):
    database_type: DatabaseType
    host: str = Field(min_length=1)
    port: int = Field(gt=0, le=65535)
    database: str = Field(min_length=1)
    username: str = Field(min_length=1)
    password: str


class SetupInitializeIn(BaseModel):
    organization_name: str = Field(min_length=1)
    admin_email: str = Field(min_length=3)
    admin_password: str = Field(min_length=6)
    license_key: str | None = None
    database: DatabaseConfigIn
    initialize_schema: bool = True


class SetupStatusOut(BaseModel):
    installed: bool
    env_exists: bool
    database_configured: bool
    database_connected: bool
    schema_initialized: bool
    database_type: str | None = None
    next_step: str
    error: str | None = None


class DatabaseTestOut(BaseModel):
    ok: bool
    database_url: str
    error: str | None = None
