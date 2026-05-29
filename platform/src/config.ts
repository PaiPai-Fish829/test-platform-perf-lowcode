/**
 * 管理平台集中配置。
 * 通过 Vite 环境变量覆盖默认值，便于本地开发与部署切换。
 */
const locustOrigin = import.meta.env.VITE_LOCUST_URL || 'http://localhost:8089'

export const appConfig = {
  /** Locust 原生 Web UI 地址 */
  locustUrl: locustOrigin,
  /** Grafana 仪表盘地址 */
  grafanaUrl: import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3000',
}

/**
 * Locust REST API 基址。
 * 开发环境默认走 Vite 代理 /locust-api，避免跨域。
 */
export const locustApiBase =
  import.meta.env.VITE_LOCUST_API_BASE ||
  (import.meta.env.DEV ? '/locust-api' : locustOrigin)
