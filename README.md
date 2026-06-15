# test-platform-perf-lowcode

基于 **Python + Locust** 的性能测试框架，采用**三端分离**架构：开发端、CI 压测端、监控端。同一仓库通过不同配置与启动命令运行不同角色。

## 目录结构

```text
locust-perf-framework/
├── locust-core/                   # 压测核心（三端共享）
│   ├── tasks/                     # 原子任务：单接口请求
│   ├── scenarios/                 # 场景：业务流程编排
│   ├── shapes/                    # LoadTestShape 策略
│   ├── utils/                     # 参数化、数据加载
│   ├── common/                    # 认证、断言、metrics、platform API
│   ├── locustfile.py              # Locust 入口
│   └── scripts/
│       ├── run.py                 # 统一 CLI（--env dev|ci）
│       └── sync_platform_env.py
├── config/                        # 分环境配置
│   ├── base.yaml                  # 公共配置
│   ├── dev.yaml                   # 开发端
│   ├── ci.yaml                    # CI 压测端
│   ├── observability.yaml         # 监控端
│   ├── settings.py                # 配置加载（深度合并 + 环境变量）
│   └── paths.py                   # 路径常量
├── deployment/                    # 部署形态
│   ├── dev/                       # 本地开发监控栈
│   ├── ci/                        # CI 模板
│   └── observability/             # 独立监控端（可单独部署）
├── platform/                      # React 管理平台
├── data/                          # 参数化数据
├── reports/                       # 压测报告输出
└── scripts/                       # 向后兼容 wrapper（已弃用）
```

## 快速上手（5 分钟 · 开发端）

```bash
git clone https://github.com/PaiPai-Fish829/locust-perf-framework.git
cd locust-perf-framework
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/macOS
pip install -r requirements.txt

cd locust-core
python scripts/run.py --env dev
```

- WebUI: http://localhost:8089
- Metrics: http://localhost:8089/metrics
- 修改 `config/dev.yaml` 可调整目标 host、端口等

---

## 一、开发端

**目标**：API 可用性验证、场景开发、参数化调试、WebUI 交互压测、本地 metrics 暴露。

### 前置依赖

- Python 3.9+
- 可选：Docker Desktop（本地监控栈）

### 启动命令

```bash
cd locust-core
python scripts/run.py --env dev
```

等价于旧命令（已弃用）：

```bash
python scripts/run.py load          # 根目录 wrapper
python scripts/run.py --env dev load
```

### 配置说明

| 文件 | 作用 |
|------|------|
| `config/base.yaml` | 公共：`data_file`、`data_strategy`（场景/策略参数见 `shapes/*.py`） |
| `config/dev.yaml` | 覆盖：host、web_ui=true、端口 8089、自动重载 |

环境变量 `LOCUST_ENV=dev` 可覆盖默认环境。

### 本地监控栈（可选）

```bash
cd deployment/dev
make up                 # 或 docker compose up -d
```

- Prometheus: http://localhost:9090/targets
- Grafana: http://localhost:3000（admin / admin）
- Dashboard 自动加载 `deployment/observability/grafana/dashboards/`

Windows + Clash 代理：`make setup-proxy` 后重启 Docker Desktop。

### 验证

1. WebUI 可访问，Start 后 RPS 有数据
2. `curl http://localhost:8089/metrics` 含 `locust_current_rps`
3. Prometheus targets 中 `locust` 为 UP

---

## 二、CI 压测端

**目标**：无 WebUI、headless 压测、CI/CD 集成、报告产出与阈值检查。

### 前置依赖

- Python 3.9+
- 目标 API 可达

### 启动命令

```bash
cd locust-core
TARGET_HOST=http://your-api.example.com python scripts/run.py --env ci --users 100 --run-time 10m
```

`config/ci.yaml` 默认：`web_ui: false`、500 用户、30 分钟。命令行参数可覆盖。

分布式（可选）：

```bash
LOCUST_MASTER=locust-master.example.com TARGET_HOST=http://api.example.com python scripts/run.py --env ci
```

### 配置说明

| 文件 | 关键项 |
|------|--------|
| `config/ci.yaml` | `locust_host: "${TARGET_HOST}"`、`web_ui: false` |
| 环境变量 | `TARGET_HOST`、`LOCUST_MASTER`、`LOCUST_USERS`、`LOCUST_RUN_TIME` |

### CI 模板

示例工作流：`deployment/ci/.github/workflows/stress-test.yml`

复制到仓库 `.github/workflows/` 后，支持手动触发压测、上传 `reports/`、错误率阈值检查（默认 5%）。

### 验证

```bash
TARGET_HOST=http://example.com python scripts/run.py --env ci --users 10 --run-time 10s
```

预期：无 UI、控制台输出统计、`reports/stress*.csv` 生成。

---

## 三、监控端

**目标**：独立部署 Prometheus + Grafana，抓取 Locust metrics 与 node_exporter，不依赖 locust-core 代码。

### 前置依赖

- Docker / Docker Compose
- Locust `/metrics` 与 node_exporter 网络可达

### 启动命令

```bash
cd deployment/observability

# 渲染 Prometheus 配置（Windows 用 Python 脚本）
export LOCUST_JOB=locust
export LOCUST_TARGETS=host.docker.internal:8089
export NODE_JOB=centos-vm
export NODE_TARGETS=192.168.47.129:9100
./scripts/gen-monitoring-config.sh    # Linux/macOS
python scripts/gen-monitoring-config.py   # Windows / 跨平台

docker compose up -d
```

### 配置说明

| 来源 | 说明 |
|------|------|
| `config/observability.yaml` | 文档化默认值（抓取间隔、job 名等） |
| 环境变量 | `LOCUST_JOB`、`LOCUST_TARGETS`、`NODE_JOB`、`NODE_TARGETS`、`SCRAPE_INTERVAL` |
| `prometheus/prometheus.yml.tpl` | 模板，由 gen 脚本渲染为 `prometheus.yml` |

### Dashboard

- `locust-overview.json`：固定 job 名（参考）
- `locust-variable.json`：变量化（`$job_locust`、`$job_node`、`$instance`），**推荐生产使用**

Provisioning 自动加载 `grafana/dashboards/` 下所有 JSON。

### 验证

1. http://localhost:9090/targets — locust、node 均为 UP
2. Grafana 选择变量化 Dashboard，切换 job 有数据

---

## 配置体系

```
config/base.yaml  +  config/{env}.yaml  →  深度合并  →  ${ENV_VAR} 替换  →  settings.py
```

**职责划分：**

| 层级 | 内容 |
|------|------|
| `config/*.yaml` | 运行形态：host、并发、web_ui、端口等 |
| `scenarios/*.py` | 业务场景（Platform 扫描选择） |
| `shapes/*.py` | 压测策略 + `SHAPE_DEFAULTS` / `SHAPE_PARAMS` |
| Platform | scenario + `shape_class` + `shape_params` 组合启动 |

CLI 默认不启用 Shape（`--shape none`）；需要阶梯压测时显式 `--shape stage` 或 `--shape stage_hold`，参数取自对应 `shapes/*.py`，可通过 `LOCUST_SHAPE_*` 环境变量覆盖。

---

## Platform 前端

```bash
cd platform
npm install
npm run dev
```

`run.py --env dev` 会自动同步 `platform/.env`。代理端口来自 `config/dev.yaml` 的 `locust_web_port`。

详见 [platform/README.md](platform/README.md)。

---

## 向后兼容

| 旧路径 | 新路径 |
|--------|--------|
| `python scripts/run.py load` | `cd locust-core && python scripts/run.py --env dev` |
| `python scripts/run.py stress` | `cd locust-core && python scripts/run.py --env ci` |
| `monitoring/` | `deployment/observability/` |
| `monitoring-local/` | `deployment/dev/` |
| `locust-config.yaml` | `config/base.yaml` + `config/dev.yaml` |

根目录 `scripts/run.py` 保留 wrapper 并输出 DeprecationWarning。

---

## 常见问题

**Prometheus 抓不到 Locust**：确认 `config/dev.yaml` 中 `locust_web_host: "0.0.0.0"`，且 Locust 已重启。

**CI 模式 host 为空**：必须设置 `TARGET_HOST` 环境变量。

**Grafana Dashboard 无 node 数据**：检查 `NODE_TARGETS` 与 node_exporter 端口，在变量 `$job_node` 中选择正确 job。

---

## License

MIT
