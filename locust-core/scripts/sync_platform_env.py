#!/usr/bin/env python
"""根据 config/*.yaml 同步 platform/.env 中的 VITE_LOCUST_URL。"""

from __future__ import annotations

import sys
from pathlib import Path

LOCORE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = LOCORE_ROOT.parent
PLATFORM_ENV = REPO_ROOT / "platform" / ".env"

for path in (str(REPO_ROOT), str(LOCORE_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)

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
        f"# 由 scripts/sync_platform_env.py 根据 config/{settings.CURRENT_ENV}.yaml 生成",
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
    print(f"已同步 {path} ← config/{settings.CURRENT_ENV}.yaml（locust_web_port={port}）")
    print(f"  VITE_LOCUST_URL=http://localhost:{port}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
