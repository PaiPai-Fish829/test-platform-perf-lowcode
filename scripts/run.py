#!/usr/bin/env python
"""Backward-compatible wrapper. Prefer: cd locust-core && python scripts/run.py --env dev"""

from __future__ import annotations

import subprocess
import sys
import warnings
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNNER = REPO_ROOT / "locust-core" / "scripts" / "run.py"


def main() -> int:
    warnings.warn(
        "根目录 scripts/run.py 已弃用，请使用: cd locust-core && python scripts/run.py --env dev|ci",
        DeprecationWarning,
        stacklevel=1,
    )
    argv = list(sys.argv)
    if len(argv) > 1 and argv[1] in {"load", "stress"} and "--env" not in argv:
        env = "dev" if argv[1] == "load" else "ci"
        argv = [argv[0], "--env", env, *argv[1:]]
    return subprocess.call([sys.executable, str(RUNNER), *argv[1:]])


if __name__ == "__main__":
    raise SystemExit(main())
