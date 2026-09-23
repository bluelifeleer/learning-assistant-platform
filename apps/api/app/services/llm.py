import json
from dataclasses import dataclass
from typing import Any

import httpx

from app.models.entities import Organization

REQUEST_TIMEOUT_SECONDS = 120.0
MAX_RETRIES = 1

JSON_OUTPUT_GUARD = "你必须只输出一个合法的 JSON 值(对象或数组),不要输出 markdown 代码围栏、解释或任何其他文字。"


class LLMNotConfiguredError(Exception):
    def __init__(self) -> None:
        super().__init__("LLM 未配置,请先在设置页填写 base_url / api_key / model")


class LLMRequestError(Exception):
    pass


@dataclass
class LLMConfig:
    base_url: str
    api_key: str
    model: str


def llm_config_for_organization(organization: Organization) -> LLMConfig:
    if not organization.llm_base_url or not organization.llm_api_key or not organization.llm_model:
        raise LLMNotConfiguredError()
    return LLMConfig(
        base_url=organization.llm_base_url.rstrip("/"),
        api_key=organization.llm_api_key,
        model=organization.llm_model,
    )


def extract_json(text: str) -> Any:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    for open_char, close_char in (("{", "}"), ("[", "]")):
        start = cleaned.find(open_char)
        end = cleaned.rfind(close_char)
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                continue
    raise LLMRequestError("LLM 返回内容不是合法 JSON")


def _post_chat_completion(config: LLMConfig, messages: list[dict[str, str]]) -> str:
    url = f"{config.base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"}
    payload = {"model": config.model, "messages": messages, "temperature": 0.3}
    last_error: Exception | None = None
    for _ in range(MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                response = client.post(url, headers=headers, json=payload)
            if response.status_code >= 400:
                raise LLMRequestError(f"LLM 请求失败: HTTP {response.status_code} {response.text[:500]}")
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise LLMRequestError("LLM 返回了空内容")
            return content
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, LLMRequestError) as exc:
            last_error = exc
    raise LLMRequestError(str(last_error))


def chat_completion(config: LLMConfig, messages: list[dict[str, str]], json_mode: bool = True) -> str:
    final_messages = list(messages)
    if json_mode:
        final_messages = [{"role": "system", "content": JSON_OUTPUT_GUARD}, *final_messages]
    return _post_chat_completion(config, final_messages)


def chat_completion_json(config: LLMConfig, messages: list[dict[str, str]]) -> Any:
    return extract_json(chat_completion(config, messages, json_mode=True))


def test_connection(config: LLMConfig) -> str | None:
    try:
        _post_chat_completion(config, [{"role": "user", "content": "ping"}])
    except LLMRequestError as exc:
        return str(exc)
    return None
