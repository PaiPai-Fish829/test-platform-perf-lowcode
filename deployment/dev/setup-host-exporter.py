#!/usr/bin/env python3
"""Download and start windows_exporter for host CPU/memory/network metrics."""

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import urllib.request
from pathlib import Path

GITHUB_API = "https://api.github.com/repos/prometheus-community/windows_exporter/releases/latest"
GITHUB_RELEASE = "https://github.com/prometheus-community/windows_exporter/releases/download/v0.31.7/windows_exporter-0.31.7-amd64.exe"
DEFAULT_PORT = 9182
TOOLS_DIR = Path(__file__).resolve().parent / "tools"
EXE_NAME = "windows_exporter.exe"


def latest_download_url() -> tuple[str, str]:
    try:
        req = urllib.request.Request(GITHUB_API, headers={"User-Agent": "locust-perf-framework"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            release = json.load(resp)
        for asset in release.get("assets", []):
            name = asset.get("name", "")
            if name.endswith("-amd64.exe"):
                return asset["browser_download_url"], release.get("tag_name", "latest")
    except Exception:
        pass
    return GITHUB_RELEASE, "v0.31.7"


def ensure_exporter() -> Path:
    TOOLS_DIR.mkdir(parents=True, exist_ok=True)
    exe_path = TOOLS_DIR / EXE_NAME
    if exe_path.exists():
        return exe_path

    url, tag = latest_download_url()
    print(f"下载 windows_exporter {tag} ...")
    urllib.request.urlretrieve(url, exe_path)
    return exe_path


def is_listening(port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def start_exporter(exe_path: Path, port: int) -> None:
    if is_listening(port):
        print(f"windows_exporter 已在运行: http://127.0.0.1:{port}/metrics")
        return

    log_path = TOOLS_DIR / "windows_exporter.log"
    cmd = [
        str(exe_path),
        f"--web.listen-address=0.0.0.0:{port}",
        "--collectors.enabled",
        "cpu,memory,logical_disk,physical_disk,net,os",
    ]
    with log_path.open("w", encoding="utf-8") as log:
        subprocess.Popen(
            cmd,
            cwd=TOOLS_DIR,
            stdout=log,
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
        )
    print(f"已启动 windows_exporter: http://127.0.0.1:{port}/metrics")
    print(f"日志: {log_path}")


def main() -> int:
    if platform.system() != "Windows":
        print("windows_exporter 仅适用于 Windows 宿主机。")
        return 1

    port = int(os.environ.get("HOST_EXPORTER_PORT", DEFAULT_PORT))
    exe_path = ensure_exporter()
    start_exporter(exe_path, port)
    print()
    print("下一步: make restart-prometheus  或  make up")
    print("Prometheus 查询示例: windows_cs_physical_memory_bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
