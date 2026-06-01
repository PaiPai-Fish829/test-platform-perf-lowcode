#!/usr/bin/env python
"""根据 locust-config.yaml 同步 platform/.env 中的 VITE_LOCUST_URL。"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PLATFORM_ENV = PROJECT_ROOT / "platform" / ".env"

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import settings  # noqa: E402


def build_env_lines(web_port: int | None = None) -> list[str]:
    port = web_port if web_port is not None else settings.LOCUST_WEB_PORT
    locust_url = f"http://localhost:{port}"
    grafana_url = "http://localhost:3000"

    if PLATFORM_ENV.is_file():
        for line in PLATFORM_ENV.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith("VITE_GRAFANA_URL="):
                grafana_url = stripped.split("=", 1)[1].strip() or grafana_url

    return [
        f"# 由 scripts/sync_platform_env.py 根据 locust-config.yaml（环境 {settings.CURRENT_ENV}）生成",
        f"VITE_LOCUST_URL={locust_url}",
        f"VITE_GRAFANA_URL={grafana_url}",
        "",
    ]


def sync_platform_env(web_port: int | None = None) -> Path:
    PLATFORM_ENV.parent.mkdir(parents=True, exist_ok=True)
    PLATFORM_ENV.write_text("\n".join(build_env_lines(web_port)), encoding="utf-8")
    return PLATFORM_ENV


def main() -> int:
    path = sync_platform_env()
    port = settings.LOCUST_WEB_PORT
    print(f"已同步 {path} ← locust-config.yaml（{settings.CURRENT_ENV} / locust_web_port={port}）")
    print(f"  VITE_LOCUST_URL=http://localhost:{port}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
