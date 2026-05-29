# Locust 压测管理平台

基于 **React + TypeScript + Vite + Ant Design** 的独立 Web 应用，用于嵌入 Locust 原生监控面板，并为 Grafana 服务器监控预留接入位置。

## 快速开始

```bash
cd platform
npm install
npm run dev
```

默认开发地址：http://localhost:5173

访问 `/monitor` 查看监控页（根路径会自动重定向到该页）。

## 环境变量

复制示例配置并按需修改：

```bash
cp .env.example .env
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_LOCUST_URL` | Locust 原生 Web UI 地址（iframe 嵌入目标） | `http://localhost:8089` |
| `VITE_GRAFANA_URL` | Grafana 仪表盘地址（Tab 2 预留） | `http://localhost:3000` |

修改 `.env` 后需重启 `npm run dev` 才能生效。

## 使用 Locust 监控

1. 在项目根目录启动 Locust WebUI：

   ```bash
   python scripts/run.py load
   ```

2. 确认 `.env` 中 `VITE_LOCUST_URL` 与 Locust 实际地址一致（默认 `http://localhost:8089`）。

3. 打开管理平台 http://localhost:5173/monitor，在「压测实时监控」Tab 中查看嵌入的 Locust 面板。

## 生产构建

```bash
npm run build
npm run preview   # 本地预览构建产物
```

构建输出目录：`platform/dist/`

## 目录结构

```text
platform/
├── src/
│   ├── components/
│   │   ├── AppLayout.tsx       # 顶部导航布局
│   │   ├── LocustMonitor.tsx   # Locust iframe 嵌入
│   │   └── GrafanaMonitor.tsx  # Grafana iframe 嵌入（预留）
│   ├── pages/
│   │   ├── MonitorPage.tsx     # 监控页（默认首页）
│   │   └── ConfigPage.tsx      # 压测配置页（开发中）
│   ├── config.ts               # 集中配置（读取环境变量）
│   ├── App.tsx                 # 路由定义
│   └── main.tsx                # 应用入口
├── .env.example
└── package.json
```

## 后续接入 Grafana

完成 Prometheus + Grafana 部署后，将 Grafana 地址写入 `.env` 的 `VITE_GRAFANA_URL`，并在 `MonitorPage.tsx` 的 Tab 2 中替换为 `<GrafanaMonitor url={appConfig.grafanaUrl} />` 即可。
