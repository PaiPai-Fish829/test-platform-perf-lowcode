#!/usr/bin/env python
"""Backward-compatible wrapper for sync_platform_env."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SYNC = REPO_ROOT / "locust-core" / "scripts" / "sync_platform_env.py"


if __name__ == "__main__":
    raise SystemExit(subprocess.call([sys.executable, str(SYNC), *sys.argv[1:]]))
