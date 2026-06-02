#!/usr/bin/env sh
# Render prometheus.yml from template using environment variables.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
TPL="${ROOT}/prometheus/prometheus.yml.tpl"
OUT="${ROOT}/prometheus/prometheus.yml"

export SCRAPE_INTERVAL="${SCRAPE_INTERVAL:-5s}"
export LOCUST_JOB="${LOCUST_JOB:-locust}"
export LOCUST_TARGETS="${LOCUST_TARGETS:-host.docker.internal:8089}"
export NODE_JOB="${NODE_JOB:-centos-vm}"
export NODE_TARGETS="${NODE_TARGETS:-192.168.47.129:9100}"

if command -v envsubst >/dev/null 2>&1; then
  envsubst '${SCRAPE_INTERVAL} ${LOCUST_JOB} ${LOCUST_TARGETS} ${NODE_JOB} ${NODE_TARGETS}' \
    < "${TPL}" > "${OUT}"
else
  python "${ROOT}/scripts/gen-monitoring-config.py"
  exit $?
fi

echo "Generated ${OUT}"
echo "  LOCUST_JOB=${LOCUST_JOB}  LOCUST_TARGETS=${LOCUST_TARGETS}"
echo "  NODE_JOB=${NODE_JOB}  NODE_TARGETS=${NODE_TARGETS}"
