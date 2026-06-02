#!/usr/bin/env python3
"""Configure Docker Desktop (WSL2 backend) to use Clash HTTP proxy."""

from __future__ import annotations

import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_PORT = 7890
FALLBACK_PORTS = (7890, 7897, 7891)
# Docker Desktop (WSL2) forwards 127.0.0.1 from the Linux VM back to Windows host.
# host.docker.internal only works when Clash enables Allow LAN (0.0.0.0).
PROXY_HOST = "127.0.0.1"
NO_PROXY = (
    "localhost,127.0.0.1,host.docker.internal,hubproxy.docker.internal,"
    "*.docker.internal,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
)


def clash_port() -> int:
    env = os.environ.get("CLASH_PORT")
    if env:
        return int(env)
    for port in FALLBACK_PORTS:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return port
    return DEFAULT_PORT


def proxy_url(port: int) -> str:
    return f"http://{PROXY_HOST}:{port}"


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    backup = path.with_suffix(path.suffix + ".bak")
    if path.exists() and not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def update_settings_store(path: Path, port: int) -> None:
    url = proxy_url(port)
    data = load_json(path)
    data.update(
        {
            "ProxyHTTPMode": "manual",
            "OverrideProxyHTTP": url,
            "OverrideProxyHTTPS": url,
            "OverrideProxyExclude": NO_PROXY,
            "ContainersProxyHTTPMode": "manual",
            "ContainersOverrideProxyHTTP": url,
            "ContainersOverrideProxyHTTPS": url,
            "ContainersOverrideProxyExclude": NO_PROXY,
        }
    )
    save_json(path, data)


def update_daemon_json(path: Path) -> None:
    data = load_json(path)
    mirrors = data.get("registry-mirrors") or []
    dead = {"https://docker.mirrors.ustc.edu.cn"}
    cleaned = [m for m in mirrors if m not in dead]
    if cleaned:
        data["registry-mirrors"] = cleaned
    else:
        data.pop("registry-mirrors", None)
    save_json(path, data)


def update_docker_config(path: Path, port: int) -> None:
    url = proxy_url(port)
    data = load_json(path)
    data["proxies"] = {
        "default": {
            "httpProxy": url,
            "httpsProxy": url,
            "noProxy": "localhost,127.0.0.1,host.docker.internal",
        }
    }
    save_json(path, data)


def update_wslconfig(path: Path) -> None:
    block = "[wsl2]\nautoProxy=false\n"
    if path.exists():
        content = path.read_text(encoding="utf-8")
        if "autoProxy=false" in content:
            return
        if "[wsl2]" in content:
            content = content.rstrip() + "\nautoProxy=false\n"
        else:
            content = content.rstrip() + "\n\n" + block
        path.write_text(content, encoding="utf-8")
    else:
        path.write_text(block, encoding="utf-8")


def restart_docker_desktop() -> None:
    if platform.system() != "Windows":
        print("Non-Windows: restart Docker Desktop manually.")
        return
    for name in ("Docker Desktop", "com.docker.backend"):
        subprocess.run(
            ["taskkill", "/IM", f"{name}.exe", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    subprocess.run(["wsl", "--shutdown"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    exe = Path(r"C:\Program Files\Docker\Docker\Docker Desktop.exe")
    if exe.exists():
        subprocess.Popen([str(exe)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Docker Desktop restarting... wait ~30s before make up")
    else:
        print("Restart Docker Desktop manually.")


def main() -> int:
    if platform.system() != "Windows":
        print("This script targets Docker Desktop on Windows + WSL2.")
        return 1

    port = clash_port()
    url = proxy_url(port)
    home = Path.home()
    appdata = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))

    settings_store = appdata / "Docker" / "settings-store.json"
    daemon_json = home / ".docker" / "daemon.json"
    docker_config = home / ".docker" / "config.json"
    wslconfig = home / ".wslconfig"

    print(f"Clash proxy port: {port}")
    print(f"Docker proxy URL: {url}")
    print()

    update_settings_store(settings_store, port)
    print(f"Updated: {settings_store}")

    update_daemon_json(daemon_json)
    print(f"Updated: {daemon_json} (removed dead ustc mirror)")

    update_docker_config(docker_config, port)
    print(f"Updated: {docker_config}")

    update_wslconfig(wslconfig)
    print(f"Updated: {wslconfig} (autoProxy=false)")

    print()
    print("Clash checklist:")
    print("  1. Clash is running")
    print("  2. Allow LAN / 允许局域网连接: ON")
    print("  3. Mixed port matches:", port)
    print()
    if os.environ.get("RESTART_DOCKER", "1") == "1":
        restart_docker_desktop()
    else:
        print("Set RESTART_DOCKER=1 or restart Docker Desktop manually.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
