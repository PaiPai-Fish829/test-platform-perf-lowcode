global:
  scrape_interval: ${SCRAPE_INTERVAL}

scrape_configs:
  - job_name: "prometheus"
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: "${LOCUST_JOB}"
    metrics_path: /metrics
    static_configs:
      - targets: ["${LOCUST_TARGETS}"]

  - job_name: "${NODE_JOB}"
    static_configs:
      - targets: ["${NODE_TARGETS}"]
