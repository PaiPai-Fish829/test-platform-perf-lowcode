#!/usr/bin/env python
"""Render prometheus.yml from prometheus.yml.tpl (cross-platform)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TPL = ROOT / "prometheus" / "prometheus.yml.tpl"
OUT = ROOT / "prometheus" / "prometheus.yml"

DEFAULTS = {
    "SCRAPE_INTERVAL": "5s",
    "LOCUST_JOB": "locust",
    "LOCUST_TARGETS": "host.docker.internal:8089",
    "NODE_JOB": "centos-vm",
    "NODE_TARGETS": "192.168.47.129:9100",
}


def render(template: str) -> str:
    result = template
    for key, default in DEFAULTS.items():
        value = os.getenv(key, default)
        result = result.replace(f"${{{key}}}", value)
    return result


def main() -> int:
    if not TPL.is_file():
        print(f"Template not found: {TPL}", file=sys.stderr)
        return 1
    content = render(TPL.read_text(encoding="utf-8"))
    OUT.write_text(content, encoding="utf-8")
    print(f"Generated {OUT}")
    for key in DEFAULTS:
        print(f"  {key}={os.getenv(key, DEFAULTS[key])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
