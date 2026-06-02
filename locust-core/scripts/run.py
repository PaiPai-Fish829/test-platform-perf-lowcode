#!/usr/bin/env python
"""Unified CLI entrypoint for Locust runs (dev / CI environments)."""

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
import time
import warnings
from pathlib import Path

LOCORE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = LOCORE_ROOT.parent
REPORTS_DIR = REPO_ROOT / "reports"
WATCH_EXTENSIONS = {".py"}


def _parse_env_early() -> None:
    for index, arg in enumerate(sys.argv[1:], start=1):
        if arg == "--env" and index < len(sys.argv) - 1:
            os.environ["LOCUST_ENV"] = sys.argv[index + 1]
            return
        if arg.startswith("--env="):
            os.environ["LOCUST_ENV"] = arg.split("=", 1)[1]
            return
    if "LOCUST_ENV" not in os.environ:
        command = sys.argv[1] if len(sys.argv) > 1 else ""
        if command == "stress":
            os.environ["LOCUST_ENV"] = "ci"
        else:
            os.environ["LOCUST_ENV"] = "dev"


_parse_env_early()

for path in (str(REPO_ROOT), str(LOCORE_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)


def _project_venv_python() -> Path | None:
    if sys.platform == "win32":
        candidate = REPO_ROOT / ".venv" / "Scripts" / "python.exe"
    else:
        candidate = REPO_ROOT / ".venv" / "bin" / "python"
    return candidate if candidate.is_file() else None


def _ensure_project_venv() -> None:
    venv_python = _project_venv_python()
    if venv_python is None:
        return
    try:
        if Path(sys.executable).resolve() == venv_python.resolve():
            return
    except OSError:
        return
    try:
        import yaml  # noqa: F401
    except ImportError:
        print(
            f"当前 Python 未安装项目依赖: {sys.executable}\n"
            f"正在切换到项目虚拟环境: {venv_python}",
            file=sys.stderr,
        )
        raise SystemExit(subprocess.call([str(venv_python), *sys.argv]))


_ensure_project_venv()

if os.getenv("LOCUST_ENV") == "observability":
    print("监控端独立于压测核心运行，请执行：")
    print("  cd deployment/observability")
    print("  python scripts/gen-monitoring-config.py")
    print("  docker compose up -d")
    raise SystemExit(0)

from config import settings  # noqa: E402


def _shape_from_env(fallback: str = "none") -> str:
    """仅响应显式 CLI --shape 或 LOCUST_SHAPE / LOCUST_ENABLE_SHAPE 环境变量。"""
    shape = os.getenv("LOCUST_SHAPE")
    if shape:
        return shape.strip().lower()
    if os.getenv("LOCUST_ENABLE_SHAPE", "0") in {"1", "true", "TRUE", "yes", "on"}:
        return "stage"
    return fallback


def _env_or_arg(env_name: str, arg_value, fallback):
    env_value = os.getenv(env_name)
    if env_value is not None and str(env_value).strip() != "":
        return env_value
    if arg_value is not None:
        return arg_value
    return fallback


def _resolve_locust_cmd() -> str:
    candidates = [
        REPO_ROOT / ".venv" / "Scripts" / "locust.exe",
        REPO_ROOT / ".venv" / "bin" / "locust",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return "locust"


def _is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("", port))
            return False
        except OSError:
            return True


def _should_watch(path: Path) -> bool:
    if path.suffix not in WATCH_EXTENSIONS:
        return False
    excluded_roots = {".venv", ".git", "__pycache__", "reports", ".pytest_cache", "node_modules", "platform"}
    return not any(part in excluded_roots for part in path.parts)


def _build_snapshot() -> dict[Path, int]:
    snapshot: dict[Path, int] = {}
    for file_path in LOCORE_ROOT.rglob("*"):
        if not file_path.is_file() or not _should_watch(file_path):
            continue
        try:
            snapshot[file_path] = file_path.stat().st_mtime_ns
        except OSError:
            continue
    return snapshot


def _locust_env() -> dict[str, str]:
    env = os.environ.copy()
    paths = [str(REPO_ROOT), str(LOCORE_ROOT)]
    existing = env.get("PYTHONPATH", "").strip()
    if existing:
        paths.append(existing)
    env["PYTHONPATH"] = os.pathsep.join(paths)
    env["LOCUST_ENV"] = settings.CURRENT_ENV
    return env


def _run_with_reload(cmd: list[str]) -> int:
    print("自动重载已启用：检测到 .py 文件变更后将重启 Locust。")
    snapshot = _build_snapshot()
    process: subprocess.Popen[str] | None = None

    try:
        while True:
            process = subprocess.Popen(cmd, cwd=LOCORE_ROOT, env=_locust_env())
            while True:
                return_code = process.poll()
                if return_code is not None:
                    return return_code
                time.sleep(1.0)
                latest = _build_snapshot()
                if latest != snapshot:
                    print("检测到代码变更，正在重启 Locust WebUI ...")
                    snapshot = latest
                    process.terminate()
                    process.wait(timeout=10)
                    break
    except KeyboardInterrupt:
        if process and process.poll() is None:
            process.terminate()
        print("\n已停止。")
        return 130


def _warn_legacy_subcommand(command: str) -> None:
    mapped = "dev" if command == "load" else "ci"
    warnings.warn(
        f"子命令 `{command}` 已弃用，请改用 `python scripts/run.py --env {mapped}`",
        DeprecationWarning,
        stacklevel=3,
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Locust unified CLI runner",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--env",
        choices=("dev", "ci", "observability"),
        default=os.getenv("LOCUST_ENV", settings.CURRENT_ENV),
        help="运行环境：dev=WebUI，ci=无头压测，observability=监控端说明",
    )
    parser.add_argument("--host", default=None, help="Override locust_host")
    parser.add_argument("--locustfile", default="locustfile.py", help="Path to locust file")
    parser.add_argument("--users", type=int, default=None, help="Override locust_users (ci)")
    parser.add_argument("--spawn-rate", type=float, default=None, help="Override locust_spawn_rate (ci)")
    parser.add_argument("--run-time", default=None, help="Override locust_run_time (ci)")
    parser.add_argument("--web-port", type=int, default=None, help="Override locust_web_port (dev)")
    parser.add_argument(
        "--web-host",
        default=None,
        help="Override locust_web_host (dev)",
    )
    parser.add_argument(
        "--shape",
        choices=("none", "stage", "stage_hold", "0", "1"),
        default=None,
        help="CLI 显式指定 LoadTestShape（默认 none；参数见 shapes/*.py 的 SHAPE_DEFAULTS）",
    )
    parser.add_argument("--csv-prefix", default=None, help="CSV output prefix")
    reload_group = parser.add_mutually_exclusive_group()
    reload_group.add_argument("--reload", dest="reload", action="store_true", default=None)
    reload_group.add_argument("--no-reload", dest="reload", action="store_false")

    subparsers = parser.add_subparsers(dest="command")

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--host", default=os.getenv("LOCUST_HOST", settings.LOCUST_HOST), help="Target host")
    common.add_argument("--locustfile", default="locustfile.py", help="Path to locust file")

    shape_help = (
        "显式启用 LoadTestShape：none(默认), stage, stage_hold。"
        "策略参数由 shapes/*.py 的 SHAPE_DEFAULTS 提供，Platform 由前端 shape_params 覆盖。"
    )

    load = subparsers.add_parser("load", parents=[common], help="[deprecated] WebUI debug mode")
    load.add_argument("--web-port", type=int, default=int(os.getenv("LOCUST_WEB_PORT", str(settings.LOCUST_WEB_PORT))))
    load.add_argument(
        "--web-host",
        default=os.getenv("LOCUST_WEB_HOST", settings.LOCUST_WEB_HOST),
        help="WebUI bind address (use 0.0.0.0 for Docker/Prometheus scrape)",
    )
    load.add_argument(
        "--shape",
        choices=("none", "stage", "stage_hold", "0", "1"),
        default=_shape_from_env(),
        help=shape_help,
    )
    load.add_argument("--csv-prefix", default="reports/load", help="CSV output prefix")
    load_group = load.add_mutually_exclusive_group()
    load_group.add_argument("--reload", dest="reload", action="store_true", default=bool(settings.LOCUST_WEB_RELOAD))
    load_group.add_argument("--no-reload", dest="reload", action="store_false")

    stress = subparsers.add_parser("stress", parents=[common], help="[deprecated] Headless stress mode")
    stress.add_argument("--users", type=int, default=int(os.getenv("LOCUST_USERS", str(settings.LOCUST_USERS))))
    stress.add_argument(
        "--spawn-rate",
        type=float,
        default=float(os.getenv("LOCUST_SPAWN_RATE", str(settings.LOCUST_SPAWN_RATE))),
    )
    stress.add_argument("--run-time", default=os.getenv("LOCUST_RUN_TIME", settings.LOCUST_RUN_TIME))
    stress.add_argument(
        "--shape",
        choices=("none", "stage", "stage_hold", "0", "1"),
        default=_shape_from_env(),
        help=shape_help,
    )
    stress.add_argument("--csv-prefix", default="reports/stress", help="CSV output prefix")

    run = subparsers.add_parser("run", parents=[common], help="Run by --env config (web_ui=true/false)")
    run.add_argument("--web-port", type=int, default=int(os.getenv("LOCUST_WEB_PORT", str(settings.LOCUST_WEB_PORT))))
    run.add_argument("--web-host", default=os.getenv("LOCUST_WEB_HOST", settings.LOCUST_WEB_HOST))
    run.add_argument(
        "--shape",
        choices=("none", "stage", "stage_hold", "0", "1"),
        default=_shape_from_env(),
        help=shape_help,
    )
    run.add_argument("--csv-prefix", default=None, help="CSV output prefix")
    run.add_argument("--users", type=int, default=int(os.getenv("LOCUST_USERS", str(settings.LOCUST_USERS))))
    run.add_argument("--spawn-rate", type=float, default=float(os.getenv("LOCUST_SPAWN_RATE", str(settings.LOCUST_SPAWN_RATE))))
    run.add_argument("--run-time", default=os.getenv("LOCUST_RUN_TIME", settings.LOCUST_RUN_TIME))
    run_group = run.add_mutually_exclusive_group()
    run_group.add_argument("--reload", dest="reload", action="store_true", default=bool(settings.LOCUST_WEB_RELOAD))
    run_group.add_argument("--no-reload", dest="reload", action="store_false")

    return parser


def _apply_defaults(args: argparse.Namespace) -> None:
    if args.host is None:
        args.host = os.getenv("LOCUST_HOST", settings.LOCUST_HOST)
    if args.shape is None:
        args.shape = _shape_from_env()
    if args.web_port is None:
        args.web_port = int(os.getenv("LOCUST_WEB_PORT", str(settings.LOCUST_WEB_PORT)))
    if args.web_host is None:
        args.web_host = os.getenv("LOCUST_WEB_HOST", settings.LOCUST_WEB_HOST)
    if args.users is None:
        args.users = int(os.getenv("LOCUST_USERS", str(settings.LOCUST_USERS)))
    if args.spawn_rate is None:
        args.spawn_rate = float(os.getenv("LOCUST_SPAWN_RATE", str(settings.LOCUST_SPAWN_RATE)))
    if args.run_time is None:
        args.run_time = os.getenv("LOCUST_RUN_TIME", settings.LOCUST_RUN_TIME)
    if args.reload is None:
        args.reload = settings.LOCUST_WEB_RELOAD


def _resolve_mode(args: argparse.Namespace) -> str:
    if args.env == "observability":
        print("监控端独立于压测核心运行，请执行：")
        print("  cd deployment/observability")
        print("  ./scripts/gen-monitoring-config.sh   # 或 python scripts/gen-monitoring-config.py")
        print("  docker compose up -d")
        return "observability"

    if args.command in {"load", "stress"}:
        _warn_legacy_subcommand(args.command)
        return args.command

    if args.command == "run" or args.command is None:
        return "load" if settings.WEB_UI else "stress"

    return "load" if settings.WEB_UI else "stress"


def _normalize_args(args: argparse.Namespace, mode: str) -> None:
    args.command = mode
    if args.command == "load":
        if getattr(args, "csv_prefix", None) in (None, ""):
            args.csv_prefix = str(REPO_ROOT / "reports" / "load")
        else:
            args.csv_prefix = str(_resolve_report_prefix(args.csv_prefix))
        if not hasattr(args, "reload"):
            args.reload = settings.LOCUST_WEB_RELOAD
    else:
        if getattr(args, "csv_prefix", None) in (None, ""):
            args.csv_prefix = str(REPO_ROOT / "reports" / "stress")
        else:
            args.csv_prefix = str(_resolve_report_prefix(args.csv_prefix))


def _resolve_report_prefix(prefix: str) -> Path:
    path = Path(prefix)
    if path.is_absolute():
        return path
    return REPO_ROOT / path


def _run_locust(args: argparse.Namespace, passthrough: list[str]) -> int:
    mode = _resolve_mode(args)
    if mode == "observability":
        return 0

    _normalize_args(args, mode)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    raw_shape = str(_env_or_arg("LOCUST_SHAPE", getattr(args, "shape", None), "none")).strip().lower()
    if raw_shape == "0":
        shape_enabled, shape_name = "0", "none"
    elif raw_shape == "1":
        shape_enabled, shape_name = "1", "stage"
    elif raw_shape == "none":
        shape_enabled, shape_name = "0", "none"
    elif raw_shape in {"stage", "stage_hold"}:
        shape_enabled, shape_name = "1", raw_shape
    else:
        raise ValueError(f"不支持的 shape: {raw_shape}")

    os.environ["LOCUST_ENABLE_SHAPE"] = shape_enabled
    os.environ["LOCUST_SHAPE"] = shape_name
    os.environ["LOCUST_HEADLESS"] = "0" if args.command == "load" else "1"

    cmd = [
        _resolve_locust_cmd(),
        "-f",
        args.locustfile,
        "--host",
        args.host,
        f"--csv={args.csv_prefix}",
        "--csv-full-history",
    ]

    if args.command == "load":
        web_port = getattr(args, "web_port", settings.LOCUST_WEB_PORT)
        web_host = getattr(args, "web_host", settings.LOCUST_WEB_HOST)
        if _is_port_in_use(web_port):
            print(
                f"端口 {web_port} 已被占用。请先停止当前占用进程，"
                f"或在 config/{settings.CURRENT_ENV}.yaml 中调整 locust_web_port。"
            )
            return 1
        try:
            from scripts.sync_platform_env import sync_platform_env

            synced = sync_platform_env(web_port)
            print(f"已同步前端环境: {synced}（VITE_LOCUST_URL=http://localhost:{web_port}）")
        except Exception as exc:
            print(f"提示: 未能同步 platform/.env（{exc}），开发前端时请手动运行 sync_platform_env.py")
        cmd.extend(["--web-port", str(web_port), "--web-host", web_host])
        print(f"WebUI URL: http://localhost:{web_port}（metrics 绑定 {web_host}）")
        if shape_enabled == "1":
            print(f"当前 shape: {shape_name}（WebUI 并发输入框会由 Locust 自动禁用）")
    else:
        master = (settings.LOCUST_MASTER_HOST or os.getenv("LOCUST_MASTER", "")).strip()
        if master and not (master.startswith("${") and master.endswith("}")):
            cmd.extend(["--master-host", master])
        cmd.extend(
            [
                "--headless",
                "--users",
                str(getattr(args, "users", settings.LOCUST_USERS)),
                "--spawn-rate",
                str(getattr(args, "spawn_rate", settings.LOCUST_SPAWN_RATE)),
                "--run-time",
                getattr(args, "run_time", settings.LOCUST_RUN_TIME),
            ]
        )
        if shape_enabled == "1":
            print(f"当前 shape: {shape_name}")

    cmd.extend(passthrough)
    print("执行命令:", " ".join(cmd))
    if args.command == "load" and getattr(args, "reload", False):
        return _run_with_reload(cmd)
    result = subprocess.run(cmd, cwd=LOCORE_ROOT, env=_locust_env(), check=False)
    return int(result.returncode)


def main() -> int:
    parser = _build_parser()
    args, passthrough = parser.parse_known_args()
    os.environ["LOCUST_ENV"] = args.env
    _apply_defaults(args)
    return _run_locust(args, passthrough)


if __name__ == "__main__":
    sys.exit(main())
