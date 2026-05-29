import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchExceptions,
  fetchLogs,
  fetchStats,
  type LocustException,
  type LocustStatsError,
  type LocustStatsReport,
  type LocustStatEntry,
} from '../api/locust'

const POLL_INTERVAL_MS = 2000
const MAX_HISTORY = 60

export interface StatsHistoryPoint {
  time: string
  totalRps: number
  failPerSec: number
  userCount: number
  p50: number
  p95: number
}

export interface LocustDashboardData {
  report: LocustStatsReport | null
  apiStats: LocustStatEntry[]
  failDetails: LocustStatsError[]
  exceptions: LocustException[]
  recentLogs: string[]
  history: StatsHistoryPoint[]
  connected: boolean
  error: string | null
  peakRps: number
  peakUsers: number
  refresh: () => void
}

function formatTimeLabel(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function useLocustStats(enabled = true): LocustDashboardData {
  const [report, setReport] = useState<LocustStatsReport | null>(null)
  const [exceptions, setExceptions] = useState<LocustException[]>([])
  const [recentLogs, setRecentLogs] = useState<string[]>([])
  const [history, setHistory] = useState<StatsHistoryPoint[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const peakRpsRef = useRef(0)
  const peakUsersRef = useRef(0)
  const [peakRps, setPeakRps] = useState(0)
  const [peakUsers, setPeakUsers] = useState(0)

  const poll = useCallback(async () => {
    try {
      const [statsData, excData, logsData] = await Promise.all([
        fetchStats(),
        fetchExceptions(),
        fetchLogs().catch(() => ({ master: [] as string[], workers: {} })),
      ])

      setReport(statsData)
      setExceptions(excData.exceptions)
      setConnected(true)
      setError(null)

      const now = new Date()
      const percentiles = statsData.current_response_time_percentiles ?? {}
      const p50 = percentiles['response_time_percentile_0.5'] ?? 0
      const p95 = percentiles['response_time_percentile_0.95'] ?? 0

      if (statsData.total_rps > peakRpsRef.current) {
        peakRpsRef.current = statsData.total_rps
        setPeakRps(statsData.total_rps)
      }
      if (statsData.user_count > peakUsersRef.current) {
        peakUsersRef.current = statsData.user_count
        setPeakUsers(statsData.user_count)
      }

      setHistory((prev) => {
        const point: StatsHistoryPoint = {
          time: formatTimeLabel(now),
          totalRps: statsData.total_rps,
          failPerSec: statsData.total_fail_per_sec,
          userCount: statsData.user_count,
          p50: p50 ?? 0,
          p95: p95 ?? 0,
        }
        const next = [...prev, point]
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next
      })

      const masterLogs = logsData.master.slice(-5).reverse()
      setRecentLogs(masterLogs)
    } catch (e) {
      setConnected(false)
      setError(e instanceof Error ? e.message : '连接 Locust 失败')
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    poll()
    const timer = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, poll])

  const apiStats = (report?.stats ?? []).filter((s) => s.name !== 'Aggregated')
  const aggregated = report?.stats?.find((s) => s.name === 'Aggregated')
  const failDetails = report?.errors ?? []

  return {
    report,
    apiStats: aggregated ? [...apiStats, aggregated] : apiStats,
    failDetails,
    exceptions,
    recentLogs,
    history,
    connected,
    error,
    peakRps,
    peakUsers,
    refresh: poll,
  }
}
