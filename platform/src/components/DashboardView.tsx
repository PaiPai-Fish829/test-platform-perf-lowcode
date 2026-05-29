import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Alert,
  Button,
  Dropdown,
  Progress,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  exportUrl,
  formatTimestamp,
  isRunning,
  stopTest,
  type LocustException,
  type LocustStatEntry,
  type LocustStatsError,
} from '../api/locust'
import { useLocustStats } from '../hooks/useLocustStats'

const THEME = '#15803d'
const P95_THRESHOLD = 500

function round(val: number | null | undefined, digits = 0): string {
  if (val == null || Number.isNaN(val)) return '-'
  return digits > 0 ? val.toFixed(digits) : String(Math.round(val))
}

interface ApiStatRow {
  key: string
  type: string
  name: string
  requests: number
  fails: number
  median: number
  p95: number
  p99: number
  avg: number
  min: number
  max: number
  avgSize: number
  currentRps: number
  currentFails: number
}

function mapApiStats(stats: LocustStatEntry[]): ApiStatRow[] {
  return stats.map((s, i) => ({
    key: `${s.method}-${s.name}-${i}`,
    type: s.method ?? '-',
    name: s.name,
    requests: s.num_requests,
    fails: s.num_failures,
    median: s.median_response_time,
    p95: (s['response_time_percentile_0.95'] as number) ?? 0,
    p99: (s['response_time_percentile_0.99'] as number) ?? 0,
    avg: s.avg_response_time,
    min: s.min_response_time,
    max: s.max_response_time,
    avgSize: s.avg_content_length,
    currentRps: s.current_rps,
    currentFails: s.current_fail_per_sec,
  }))
}

const apiColumns: ColumnsType<ApiStatRow> = [
  { title: 'Type', dataIndex: 'type', width: 80, fixed: 'left' },
  { title: 'Name', dataIndex: 'name', width: 180, ellipsis: true },
  { title: '#Requests', dataIndex: 'requests', width: 100 },
  {
    title: '#Fails',
    dataIndex: 'fails',
    width: 80,
    render: (v: number) => (
      <span className={v > 0 ? 'fails-highlight' : undefined}>{v}</span>
    ),
  },
  { title: 'Median(ms)', dataIndex: 'median', width: 100, render: (v) => round(v) },
  {
    title: '95%ile(ms)',
    dataIndex: 'p95',
    width: 110,
    render: (v: number) => (
      <span className={v > P95_THRESHOLD ? 'p95-highlight' : undefined}>
        {round(v)}
        {v > P95_THRESHOLD ? ' 🔥' : ''}
      </span>
    ),
  },
  { title: '99%ile(ms)', dataIndex: 'p99', width: 110, render: (v) => round(v) },
  { title: 'Average(ms)', dataIndex: 'avg', width: 110, render: (v) => round(v, 1) },
  { title: 'Min(ms)', dataIndex: 'min', width: 90, render: (v) => round(v) },
  { title: 'Max(ms)', dataIndex: 'max', width: 90, render: (v) => round(v) },
  { title: 'Avg Size(bytes)', dataIndex: 'avgSize', width: 130, render: (v) => round(v) },
  { title: 'Current RPS', dataIndex: 'currentRps', width: 110, render: (v) => round(v, 1) },
  {
    title: 'Current Fails/s',
    dataIndex: 'currentFails',
    width: 120,
    render: (v) => round(v, 2),
  },
]

interface FailRow {
  key: string
  failCount: number
  method: string
  apiName: string
  errorInfo: string
  firstSeen: string
  lastSeen: string
}

const failColumns: ColumnsType<FailRow> = [
  { title: '失败数', dataIndex: 'failCount', width: 80 },
  { title: '方法', dataIndex: 'method', width: 70 },
  { title: '接口名', dataIndex: 'apiName', width: 150, ellipsis: true },
  { title: '错误信息', dataIndex: 'errorInfo', ellipsis: true },
  { title: '首次出现', dataIndex: 'firstSeen', width: 160 },
  { title: '最后出现', dataIndex: 'lastSeen', width: 160 },
]

interface ExceptionRow {
  key: string
  count: number
  exceptionInfo: string
  stackSummary: string
}

const exceptionColumns: ColumnsType<ExceptionRow> = [
  { title: '发生次数', dataIndex: 'count', width: 90 },
  { title: '异常信息', dataIndex: 'exceptionInfo', ellipsis: true },
  { title: '堆栈摘要', dataIndex: 'stackSummary', ellipsis: true },
]

export default function DashboardView() {
  const {
    report,
    apiStats,
    failDetails,
    exceptions,
    recentLogs,
    history,
    connected,
    error,
    peakRps,
    peakUsers,
  } = useLocustStats()

  const total = report?.stats?.find((s) => s.name === 'Aggregated')
  const failRatio = report?.fail_ratio ?? 0
  const successRate = Math.max(0, (1 - failRatio) * 100)
  const p95 =
    report?.current_response_time_percentiles?.['response_time_percentile_0.95'] ?? 0

  const rpsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['总请求/秒', '失败请求/秒'], right: 0 },
      xAxis: {
        type: 'category' as const,
        data: history.map((h) => h.time),
        axisLabel: { fontSize: 10 },
      },
      yAxis: { type: 'value' as const, name: '请求数' },
      series: [
        {
          name: '总请求/秒',
          type: 'line' as const,
          data: history.map((h) => h.totalRps),
          smooth: true,
          lineStyle: { color: THEME, width: 2 },
          symbol: 'none',
        },
        {
          name: '失败请求/秒',
          type: 'line' as const,
          data: history.map((h) => h.failPerSec),
          smooth: true,
          lineStyle: { color: '#F56C6C', width: 2 },
          symbol: 'none',
        },
      ],
    }),
    [history],
  )

  const responseTimeOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['P50', 'P95'], right: 0 },
      xAxis: {
        type: 'category' as const,
        data: history.map((h) => h.time),
        axisLabel: { fontSize: 10 },
      },
      yAxis: { type: 'value' as const, name: 'ms', min: 0 },
      series: [
        {
          name: 'P50',
          type: 'line' as const,
          data: history.map((h) => h.p50),
          smooth: true,
          lineStyle: { color: '#67C23A', width: 2 },
          symbol: 'none',
        },
        {
          name: 'P95',
          type: 'line' as const,
          data: history.map((h) => h.p95),
          smooth: true,
          lineStyle: { color: '#E6A23C', width: 2 },
          symbol: 'none',
        },
      ],
    }),
    [history],
  )

  const activeUsersOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' as const },
      xAxis: {
        type: 'category' as const,
        data: history.map((h) => h.time),
        axisLabel: { fontSize: 10 },
      },
      yAxis: { type: 'value' as const, name: '用户数' },
      series: [
        {
          name: '活跃用户数',
          type: 'line' as const,
          data: history.map((h) => h.userCount),
          smooth: true,
          lineStyle: { color: THEME, width: 2 },
          symbol: 'circle',
          symbolSize: 4,
          areaStyle: { color: 'rgba(21,128,61,0.15)' },
        },
      ],
    }),
    [history],
  )

  const failRows: FailRow[] = failDetails.map((e: LocustStatsError, i) => ({
    key: `${e.method}-${e.name}-${i}`,
    failCount: e.occurrences,
    method: e.method,
    apiName: e.name,
    errorInfo: e.error,
    firstSeen: formatTimestamp(e.first_seen),
    lastSeen: formatTimestamp(e.last_seen),
  }))

  const exceptionRows: ExceptionRow[] = exceptions.map(
    (e: LocustException, i) => ({
      key: `exc-${i}`,
      count: e.count,
      exceptionInfo: e.msg,
      stackSummary: e.traceback.split('\n').slice(0, 2).join(' '),
    }),
  )

  const exportMenuItems = [
    { key: 'requests', label: '请求统计 CSV' },
    { key: 'failures', label: '失败明细 CSV' },
    { key: 'exceptions', label: '异常 CSV' },
    { key: 'report', label: 'HTML 报告' },
  ]

  const handleExport = ({ key }: { key: string }) => {
    const paths: Record<string, string> = {
      requests: '/stats/requests/csv',
      failures: '/stats/failures/csv',
      exceptions: '/exceptions/csv',
      report: '/stats/report?download=1',
    }
    window.open(exportUrl(paths[key] ?? '/stats/requests/csv'), '_blank')
  }

  return (
    <div>
      {!connected && error && (
        <Alert
          className="connection-alert"
          type="warning"
          showIcon
          message="Locust 连接异常"
          description={error}
        />
      )}

      <div className="kpi-row">
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">当前 RPS</span>
          </div>
          <div className="kpi-value">{round(report?.total_rps, 1)}</div>
          <div className="kpi-sub">
            峰值 <span className="highlight">{round(peakRps, 1)}</span>
          </div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">失败率</span>
          </div>
          <div className={`kpi-value${failRatio > 0.01 ? ' error' : ''}`}>
            {(failRatio * 100).toFixed(2)}%
          </div>
          <div className="kpi-sub">
            成功率 <span className="highlight">{successRate.toFixed(2)}%</span>
          </div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">P95 响应时间</span>
          </div>
          <div className="kpi-value">{round(p95)}ms</div>
          <div className="kpi-sub">
            阈值 <span className="highlight">{P95_THRESHOLD}ms</span>
          </div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">活跃用户数</span>
          </div>
          <div className="kpi-value">{report?.user_count ?? 0}</div>
          <div className="kpi-sub">
            峰值 <span className="highlight">{peakUsers}</span>
          </div>
        </div>
      </div>

      <div className="glass-card chart-section">
        <h3 className="chart-title">每秒请求数 (RPS)</h3>
        <ReactECharts option={rpsOption} style={{ height: 260 }} notMerge />
      </div>

      <div className="glass-card chart-section">
        <h3 className="chart-title">响应时间 (ms)</h3>
        <ReactECharts option={responseTimeOption} style={{ height: 260 }} notMerge />
      </div>

      <div className="glass-card chart-section">
        <h3 className="chart-title">活跃用户数趋势</h3>
        <ReactECharts option={activeUsersOption} style={{ height: 260 }} notMerge />
      </div>

      <div className="glass-card table-section">
        <h3 className="section-title">详细 API 统计</h3>
        <Table<ApiStatRow>
          size="small"
          bordered
          scroll={{ x: 1400 }}
          pagination={false}
          dataSource={mapApiStats(apiStats)}
          columns={apiColumns}
        />
        {total && (
          <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
            聚合：{total.num_requests} 请求，{total.num_failures} 失败，平均响应 {round(total.avg_response_time, 1)} ms
          </Typography.Text>
        )}
      </div>

      <div className="table-row">
        <div className="glass-card table-half left">
          <h3 className="section-title">失败请求明细</h3>
          <Table<FailRow>
            size="small"
            bordered
            pagination={false}
            scroll={{ y: 250 }}
            dataSource={failRows}
            columns={failColumns}
            locale={{ emptyText: '暂无失败记录' }}
          />
        </div>
        <div className="glass-card table-half right">
          <h3 className="section-title">异常统计</h3>
          <Table<ExceptionRow>
            size="small"
            bordered
            pagination={false}
            scroll={{ y: 250 }}
            dataSource={exceptionRows}
            columns={exceptionColumns}
            locale={{ emptyText: '暂无异常' }}
          />
        </div>
      </div>

      <div className="glass-card toolbar-section">
        <div className="log-preview">
          {recentLogs.length > 0 ? (
            recentLogs.map((log, idx) => (
              <div key={idx} className="log-item">
                <Tag color="default" style={{ fontSize: 11 }}>
                  log
                </Tag>
                {log}
              </div>
            ))
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              暂无日志（压测运行后将显示 Locust master 日志）
            </Typography.Text>
          )}
        </div>
        <div className="success-rate">
          <span className="rate-label">成功率</span>
          <Progress
            percent={Number(successRate.toFixed(2))}
            strokeColor={THEME}
            size="small"
            style={{ flex: 1 }}
          />
        </div>
        <Dropdown menu={{ items: exportMenuItems, onClick: handleExport }}>
          <Button type="primary" style={{ background: THEME, borderColor: THEME }}>
            导出数据
          </Button>
        </Dropdown>
      </div>
    </div>
  )
}

export function DashboardHeaderActions({
  state,
  onStop,
}: {
  state: string | undefined
  onStop: () => void
}) {
  const running = state ? isRunning(state as Parameters<typeof isRunning>[0]) : false

  const handleStop = async () => {
    try {
      const res = await stopTest()
      if (res.success) {
        message.success(res.message)
        onStop()
      } else {
        message.error(res.message)
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '停止失败')
    }
  }

  return (
    <Space>
      <Button danger size="small" disabled={!running} onClick={handleStop}>
        停止运行
      </Button>
    </Space>
  )
}
