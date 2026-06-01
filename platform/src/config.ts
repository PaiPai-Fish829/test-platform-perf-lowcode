/**
 * 管理平台集中配置。
 *
 * Locust 端口来源（优先级）：
 * 1. 开发：`vite.config.ts` 代理目标 ← 根目录 `locust-config.yaml`（与 `python scripts/run.py load` 一致）
 * 2. 环境变量 `VITE_LOCUST_URL`（可由 `python scripts/sync_platform_env.py` 从 yaml 写入 platform/.env）
 * 3. 运行时 `GET /platform/config`（见 fetchPlatformRuntimeConfig）
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
 * 开发环境走 Vite 代理 `/locust-api`（目标端口由 locust-config.yaml 决定，见 vite.locust.ts）。
 */
export const locustApiBase =
  import.meta.env.VITE_LOCUST_API_BASE ||
  (import.meta.env.DEV ? '/locust-api' : locustOrigin)

export interface PlatformRuntimeConfig {
  current_env: string
  locust_web_port: number
  locust_url: string
  locust_host: string
}

/** 从已连接的 Locust 读取当前配置（端口与压测 host） */
export async function fetchPlatformRuntimeConfig(): Promise<PlatformRuntimeConfig> {
  const res = await fetch(`${locustApiBase}/platform/config`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`加载平台配置失败 (${res.status})`)
  }
  return res.json() as Promise<PlatformRuntimeConfig>
}
