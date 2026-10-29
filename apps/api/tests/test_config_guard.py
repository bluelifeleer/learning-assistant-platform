"""生产环境配置自检：默认 pepper 必须拒绝启动。"""

import pytest

from app.core.config import Settings, ensure_safe_config


def test_development_allows_default_pepper() -> None:
    # 本地开发就是用默认值跑起来的，不能报错
    ensure_safe_config(Settings(app_env="development", api_token_pepper="change-me-token-pepper"))


def test_production_rejects_default_pepper() -> None:
    with pytest.raises(RuntimeError, match="API_TOKEN_PEPPER 仍是默认值"):
        ensure_safe_config(Settings(app_env="production", api_token_pepper="change-me-token-pepper"))


def test_production_rejects_empty_pepper() -> None:
    with pytest.raises(RuntimeError, match="API_TOKEN_PEPPER"):
        ensure_safe_config(Settings(app_env="production", api_token_pepper=""))


def test_production_rejects_short_pepper() -> None:
    with pytest.raises(RuntimeError, match="太短"):
        ensure_safe_config(Settings(app_env="production", api_token_pepper="short"))


def test_production_accepts_generated_pepper() -> None:
    ensure_safe_config(Settings(app_env="production", api_token_pepper="a" * 64))
