"""Load merged YAML config: base.yaml + {env}.yaml with env-var substitution."""

from __future__ import annotations

import os
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore[reportMissingImports]
except ImportError as exc:
    raise ImportError("缺少 PyYAML 依赖，请先执行 `pip install -r requirements.txt`。") from exc

from config.paths import CONFIG_DIR

_ENV_VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def _expand_env(value: Any) -> Any:
    if isinstance(value, str):
        def repl(match: re.Match[str]) -> str:
            name = match.group(1)
            return os.getenv(name, match.group(0))

        return _ENV_VAR_PATTERN.sub(repl, value)
    if isinstance(value, dict):
        return {k: _expand_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand_env(item) for item in value]
    return value


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"未找到配置文件: {path}")
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        raise ValueError(f"配置文件格式错误，顶层必须是 YAML Mapping: {path}")
    return data


def load_env_config(env: str | None = None) -> dict[str, Any]:
    current = env or os.getenv("LOCUST_ENV", "dev")
    base = _load_yaml(CONFIG_DIR / "base.yaml")
    env_file = CONFIG_DIR / f"{current}.yaml"
    if not env_file.exists():
        raise ValueError(f"环境 `{current}` 不存在，缺少配置文件: {env_file}")
    merged = _deep_merge(base, _load_yaml(env_file))
    return _expand_env(merged)


def load_observability_config() -> dict[str, Any]:
    path = CONFIG_DIR / "observability.yaml"
    return _expand_env(_load_yaml(path))


def _require_text(source: dict[str, Any], key: str) -> str:
    value = source.get(key)
    if not isinstance(value, str):
        raise ValueError(f"配置项 `{key}` 必须是字符串。")
    return value


def _require_int(source: dict[str, Any], key: str) -> int:
    value = source.get(key)
    if isinstance(value, bool):
        raise ValueError(f"配置项 `{key}` 必须是整数。")
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and value.strip():
        return int(value)
    raise ValueError(f"配置项 `{key}` 必须是整数。")


def _require_bool(source: dict[str, Any], key: str) -> bool:
    value = source.get(key)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    raise ValueError(f"配置项 `{key}` 必须是布尔值。")


def _require_mapping(source: dict[str, Any], key: str) -> dict[str, Any]:
    value = source.get(key)
    if not isinstance(value, dict):
        raise ValueError(f"配置项 `{key}` 必须是 mapping。")
    return value


def _optional_int(source: dict[str, Any], key: str, default: int) -> int:
    value = source.get(key, default)
    if value is None:
        return default
    if isinstance(value, bool):
        raise ValueError(f"配置项 `{key}` 必须是整数。")
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return default
        return int(text)
    raise ValueError(f"配置项 `{key}` 必须是整数。")


def _optional_text(source: dict[str, Any], key: str, default: str) -> str:
    value = source.get(key, default)
    if value is None:
        return default
    if not isinstance(value, str):
        raise ValueError(f"配置项 `{key}` 必须是字符串。")
    return value


CURRENT_ENV = os.getenv("LOCUST_ENV", "dev")
if CURRENT_ENV == "observability":
    raise ValueError("LOCUST_ENV=observability 不适用于压测运行时，请使用 deployment/observability 部署监控栈。")

_CONFIG = load_env_config(CURRENT_ENV)

LOCUST_HOST = _require_text(_CONFIG, "locust_host")
LOCUST_USERS = _require_int(_CONFIG, "locust_users")
LOCUST_SPAWN_RATE = _require_int(_CONFIG, "locust_spawn_rate")
LOCUST_RUN_TIME = _require_text(_CONFIG, "locust_run_time")
LOCUST_WEB_PORT = _require_int(_CONFIG, "locust_web_port")
LOCUST_WEB_HOST = _optional_text(_CONFIG, "locust_web_host", "0.0.0.0")
LOCUST_WEB_RELOAD = _require_bool(_CONFIG, "locust_web_reload")
WEB_UI = _require_bool(_CONFIG, "web_ui")
LOCUST_MASTER_HOST = _optional_text(_CONFIG, "locust_master_host", "")

DATA_FILE = _require_text(_CONFIG, "data_file")
DATA_STRATEGY = _optional_text(_CONFIG, "data_strategy", "cycle")
