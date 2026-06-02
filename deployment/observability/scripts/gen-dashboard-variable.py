"""Generate locust-variable.json from locust-overview.json."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARDS = ROOT / "grafana" / "dashboards"
SRC = DASHBOARDS / "locust-overview.json"
DST = DASHBOARDS / "locust-variable.json"


def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    text = text.replace('job="locust"', 'job="$job_locust"')
    text = text.replace('job="centos-vm"', 'job="$job_node"')
    text = text.replace("CentOS VM", "Node")
    text = text.replace("Locust + CentOS VM Overview", "Locust Variable Overview")
    dash = json.loads(text)
    dash["variables"] = [
        {
            "kind": "QueryVariable",
            "spec": {
                "name": "job_locust",
                "label": "Locust Job",
                "hide": "dontHide",
                "refresh": "onDashboardLoad",
                "query": {
                    "kind": "DataQuery",
                    "spec": {"expr": "label_values(locust_current_rps, job)", "refId": "A"},
                },
                "multi": False,
                "includeAll": False,
            },
        },
        {
            "kind": "QueryVariable",
            "spec": {
                "name": "job_node",
                "label": "Node Exporter Job",
                "hide": "dontHide",
                "refresh": "onDashboardLoad",
                "query": {
                    "kind": "DataQuery",
                    "spec": {"expr": "label_values(node_cpu_seconds_total, job)", "refId": "A"},
                },
                "multi": False,
                "includeAll": False,
            },
        },
        {
            "kind": "QueryVariable",
            "spec": {
                "name": "instance",
                "label": "Instance",
                "hide": "dontHide",
                "refresh": "onDashboardLoad",
                "query": {
                    "kind": "DataQuery",
                    "spec": {
                        "expr": 'label_values(node_cpu_seconds_total{job="$job_node"}, instance)',
                        "refId": "A",
                    },
                },
                "multi": True,
                "includeAll": True,
            },
        },
    ]
    DST.write_text(json.dumps(dash, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Generated {DST}")


if __name__ == "__main__":
    main()
