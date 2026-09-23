import httpx
import pytest

from app.models.entities import Organization
from app.services import llm


class FakeResponse:
    def __init__(self, status_code: int = 200, payload: dict | None = None, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self) -> dict:
        return self._payload


class FakeClient:
    calls: list[dict] = []
    queue: list = []
    timeouts: list = []

    def __init__(self, timeout=None, **kwargs) -> None:
        FakeClient.timeouts.append(timeout)

    def __enter__(self) -> "FakeClient":
        return self

    def __exit__(self, *args) -> None:
        return None

    def post(self, url: str, headers: dict | None = None, json: dict | None = None) -> FakeResponse:
        FakeClient.calls.append({"url": url, "headers": headers, "json": json})
        outcome = FakeClient.queue.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def ok_response(content: str) -> FakeResponse:
    return FakeResponse(payload={"choices": [{"message": {"content": content}}]})


@pytest.fixture(autouse=True)
def fake_httpx(monkeypatch) -> None:
    FakeClient.calls = []
    FakeClient.queue = []
    FakeClient.timeouts = []
    monkeypatch.setattr(llm.httpx, "Client", FakeClient)


def make_config() -> llm.LLMConfig:
    return llm.LLMConfig(base_url="https://llm.example.com/v1", api_key="sk-test-key", model="test-model")


def test_chat_completion_sends_openai_compatible_request() -> None:
    FakeClient.queue = [ok_response('{"a": 1}')]

    result = llm.chat_completion(make_config(), [{"role": "user", "content": "hi"}], json_mode=True)

    assert result == '{"a": 1}'
    call = FakeClient.calls[0]
    assert call["url"] == "https://llm.example.com/v1/chat/completions"
    assert call["headers"]["Authorization"] == "Bearer sk-test-key"
    assert call["json"]["model"] == "test-model"
    assert call["json"]["messages"][0]["role"] == "system"
    assert "JSON" in call["json"]["messages"][0]["content"]
    assert call["json"]["messages"][1] == {"role": "user", "content": "hi"}
    assert FakeClient.timeouts[0] == 120.0


def test_chat_completion_without_json_mode_keeps_messages() -> None:
    FakeClient.queue = [ok_response("plain")]

    llm.chat_completion(make_config(), [{"role": "user", "content": "hi"}], json_mode=False)

    assert FakeClient.calls[0]["json"]["messages"] == [{"role": "user", "content": "hi"}]


def test_extract_json_tolerates_fences_and_surrounding_text() -> None:
    fenced = "前言\n```json\n{\"summary_md\": \"x\", \"key_points\": []}\n```\n后记"
    assert llm.extract_json(fenced) == {"summary_md": "x", "key_points": []}
    embedded = "结果是: [1, 2] 以上"
    assert llm.extract_json(embedded) == [1, 2]
    assert llm.extract_json('{"a": {"b": 1}}') == {"a": {"b": 1}}
    with pytest.raises(llm.LLMRequestError):
        llm.extract_json("完全不是 JSON")


def test_chat_completion_retries_once_on_network_error() -> None:
    FakeClient.queue = [httpx.ConnectError("boom"), ok_response("ok-after-retry")]

    result = llm.chat_completion(make_config(), [{"role": "user", "content": "hi"}], json_mode=False)

    assert result == "ok-after-retry"
    assert len(FakeClient.calls) == 2


def test_chat_completion_raises_after_retry_exhausted() -> None:
    FakeClient.queue = [FakeResponse(status_code=500, text="server error"), FakeResponse(status_code=500, text="server error")]

    with pytest.raises(llm.LLMRequestError, match="HTTP 500"):
        llm.chat_completion(make_config(), [{"role": "user", "content": "hi"}], json_mode=False)

    assert len(FakeClient.calls) == 2


def test_llm_config_requires_full_configuration() -> None:
    organization = Organization(name="org")
    with pytest.raises(llm.LLMNotConfiguredError):
        llm.llm_config_for_organization(organization)
    partial = Organization(name="org", llm_base_url="https://llm.example.com/v1", llm_api_key="sk-x")
    with pytest.raises(llm.LLMNotConfiguredError):
        llm.llm_config_for_organization(partial)
    full = Organization(name="org", llm_base_url="https://llm.example.com/v1/", llm_api_key="sk-x", llm_model="m")
    config = llm.llm_config_for_organization(full)
    assert config.base_url == "https://llm.example.com/v1"


def test_test_connection_reports_error_string() -> None:
    FakeClient.queue = [ok_response("pong")]
    assert llm.test_connection(make_config()) is None
    FakeClient.queue = [FakeResponse(status_code=401, text="bad key"), FakeResponse(status_code=401, text="bad key")]
    detail = llm.test_connection(make_config())
    assert detail is not None
    assert "401" in detail
