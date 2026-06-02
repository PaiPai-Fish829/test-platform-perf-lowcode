"""Repository and locust-core path constants."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCORE_ROOT = REPO_ROOT / "locust-core"
DATA_DIR = REPO_ROOT / "data"
REPORTS_DIR = REPO_ROOT / "reports"
CONFIG_DIR = REPO_ROOT / "config"
