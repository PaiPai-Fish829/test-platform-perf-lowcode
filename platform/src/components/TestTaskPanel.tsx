import { useCallback, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Button,
  Checkbox,
  Collapse,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Typography,
  message,
} from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { startSwarm } from '../api/locust'

const THEME = '#15803d'

interface ScenarioItem {
  name: string
  tags: string[]
  successRate: number
  checked: boolean
}

interface ScenarioGroup {
  name: string
  items: ScenarioItem[]
}

interface StrategyParam {
  label: string
  value: number
  min: number
  max: number
  unit: string
}

const TAG_COLORS: Record<string, string> = {
  login: '#3B82F6',
  user: '#10B981',
  smoke: '#F59E0B',
  order: '#8B5CF6',
  p0: '#EF4444',
  p1: '#F97316',
}

const INITIAL_GROUPS: ScenarioGroup[] = [
  {
    name: '用户模块',
    items: [
      { name: '登录登出流程', tags: ['login', 'smoke'], successRate: 99.2, checked: true },
      { name: '用户信息查询', tags: ['user'], successRate: 100, checked: true },
      { name: '修改密码流程', tags: ['user', 'smoke'], successRate: 98.5, checked: false },
    ],
  },
  {
    name: '订单模块',
    items: [
      { name: '创建订单流程', tags: ['order', 'p0'], successRate: 97.8, checked: true },
      { name: '查询订单列表', tags: ['order'], successRate: 100, checked: false },
      { name: '订单详情查看', tags: ['order'], successRate: 99.9, checked: false },
      { name: '取消订单流程', tags: ['order', 'p1'], successRate: 95.2, checked: false },
    ],
  },
]

const STRATEGY_TEMPLATES = ['阶梯增长', '波浪形', '突发峰值', '稳定性测试', '自定义']

function buildInitialParams(): Record<string, StrategyParam[]> {
  return {
    阶梯增长: [
      { label: '起始用户数', value: 0, min: 0, max: 10000, unit: '' },
      { label: '峰值用户数', value: 200, min: 1, max: 100000, unit: '' },
      { label: '爬坡时间', value: 30, min: 1, max: 600, unit: '秒' },
      { label: '每个阶梯时长', value: 60, min: 1, max: 3600, unit: '秒' },
      { label: '孵化率', value: 10, min: 1, max: 1000, unit: 'users/秒' },
    ],
    波浪形: [
      { label: '振幅', value: 100, min: 1, max: 10000, unit: '' },
      { label: '周期', value: 60, min: 1, max: 3600, unit: '秒' },
      { label: '基线', value: 50, min: 0, max: 10000, unit: '' },
    ],
    突发峰值: [
      { label: '基线', value: 50, min: 0, max: 10000, unit: '' },
      { label: '峰值', value: 500, min: 1, max: 100000, unit: '' },
      { label: '峰值时刻', value: 120, min: 1, max: 3600, unit: '秒' },
    ],
    稳定性测试: [
      { label: '恒定用户数', value: 100, min: 1, max: 100000, unit: '' },
      { label: '运行时长', value: 30, min: 1, max: 999, unit: '分钟' },
    ],
    自定义: [],
  }
}

function buildStrategyChart(tpl: string) {
  const data: number[] = []
  const steps = 60
  for (let i = 0; i <= steps; i++) {
    const t = i
    let v = 0
    if (tpl === '阶梯增长') {
      const peak = 200
      const rampSteps = 10
      v = t < rampSteps ? (peak / rampSteps) * t : peak
    } else if (tpl === '波浪形') {
      v = 50 + 100 * Math.sin((t / 20) * Math.PI)
    } else if (tpl === '突发峰值') {
      const base = 50
      const peak = 500
      if (t < 10) v = base
      else if (t < 25) v = base + ((peak - base) / 15) * (t - 10)
      else if (t < 35) v = peak
      else v = base
    } else if (tpl === '稳定性测试') {
      v = 100
    } else {
      v = 50 + t * 2
    }
    data.push(v)
  }
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 40, right: 20, top: 10, bottom: 25 },
    xAxis: {
      type: 'category' as const,
      data: data.map((_, i) => `${i * 6}s`),
      show: false,
    },
    yAxis: { type: 'value' as const, show: false },
    series: [
      {
        data,
        type: 'line' as const,
        smooth: true,
        lineStyle: { color: THEME, width: 2 },
        areaStyle: { color: 'rgba(21,128,61,0.1)' },
        symbol: 'none',
      },
    ],
  }
}

export default function TestTaskPanel() {
  const [taskName, setTaskName] = useState('未命名任务_20260129')
  const [scenarioSearch, setScenarioSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [scenarioGroups, setScenarioGroups] = useState(INITIAL_GROUPS)
  const [activeStrategy, setActiveStrategy] = useState('阶梯增长')
  const [strategyParams, setStrategyParams] = useState(buildInitialParams)
  const [executeMode, setExecuteMode] = useState<'immediate' | 'scheduled'>('immediate')
  const [scheduledTime, setScheduledTime] = useState<dayjs.Dayjs | null>(null)
  const [durationMinutes, setDurationMinutes] = useState(5)
  const [runUntilStop, setRunUntilStop] = useState(false)
  const [thinkMode, setThinkMode] = useState<'none' | 'fixed' | 'random'>('fixed')
  const [fixedWait, setFixedWait] = useState(1)
  const [randomWaitMin, setRandomWaitMin] = useState(0.5)
  const [randomWaitMax, setRandomWaitMax] = useState(3)
  const [enableCsv, setEnableCsv] = useState(false)
  const [csvPath, setCsvPath] = useState('./test_data/users.csv')
  const [dataAlloc, setDataAlloc] = useState('loop')
  const [enableDynamicData, setEnableDynamicData] = useState(false)
  const [enableDistributed, setEnableDistributed] = useState(false)
  const [workerCount, setWorkerCount] = useState(3)
  const [masterUrl, setMasterUrl] = useState('http://localhost:8089')
  const [expectedWorkers, setExpectedWorkers] = useState(3)
  const [autoSaveReport, setAutoSaveReport] = useState(true)
  const [exportCsv, setExportCsv] = useState(true)
  const [outputPath, setOutputPath] = useState('./reports/')
  const [enableWebSocket, setEnableWebSocket] = useState(false)
  const [enablePrometheus, setEnablePrometheus] = useState(false)
  const [executing, setExecuting] = useState(false)

  const allTags = useMemo(
    () => [...new Set(scenarioGroups.flatMap((g) => g.items.flatMap((i) => i.tags)))],
    [scenarioGroups],
  )

  const filteredGroups = useMemo(() => {
    const search = scenarioSearch.toLowerCase()
    return scenarioGroups
      .map((group) => {
        let items = group.items
        if (search) items = items.filter((item) => item.name.toLowerCase().includes(search))
        if (selectedTags.length > 0) {
          items = items.filter((item) => item.tags.some((t) => selectedTags.includes(t)))
        }
        return { ...group, items }
      })
      .filter((g) => g.items.length > 0)
  }, [scenarioGroups, scenarioSearch, selectedTags])

  const currentParams = strategyParams[activeStrategy] ?? []

  const summaryItems = useMemo(() => {
    const selectedScenarios: string[] = []
    const tags: string[] = []
    for (const g of scenarioGroups) {
      for (const item of g.items) {
        if (item.checked) {
          selectedScenarios.push(item.name)
          for (const tag of item.tags) {
            if (!tags.includes(tag)) tags.push(tag)
          }
        }
      }
    }
    const paramDesc = currentParams.map((p) => `${p.label} ${p.value}${p.unit}`).join(', ')
    return [
      { label: '场景', value: `${selectedScenarios.length}个 (${selectedScenarios.join('、') || '无'})` },
      { label: '标签', value: tags.map((t) => `#${t}`).join(' ') || '无' },
      { label: '策略', value: `${activeStrategy} (${paramDesc})` },
      {
        label: '执行',
        value:
          executeMode === 'immediate'
            ? '立即执行'
            : `定时 ${scheduledTime?.format('YYYY-MM-DD HH:mm') ?? '-'}`,
      },
      { label: '参数化', value: enableCsv ? '已启用CSV' : '未启用' },
      { label: '分布式', value: enableDistributed ? `${workerCount}个Worker` : '未启用' },
    ]
  }, [
    scenarioGroups,
    currentParams,
    activeStrategy,
    executeMode,
    scheduledTime,
    enableCsv,
    enableDistributed,
    workerCount,
  ])

  const chartOption = useMemo(() => buildStrategyChart(activeStrategy), [activeStrategy])

  const toggleScenario = (groupName: string, itemName: string, checked: boolean) => {
    setScenarioGroups((groups) =>
      groups.map((g) =>
        g.name === groupName
          ? {
              ...g,
              items: g.items.map((item) =>
                item.name === itemName ? { ...item, checked } : item,
              ),
            }
          : g,
      ),
    )
  }

  const updateParam = (idx: number, value: number | null) => {
    if (value == null) return
    setStrategyParams((prev) => {
      const list = [...(prev[activeStrategy] ?? [])]
      list[idx] = { ...list[idx], value }
      return { ...prev, [activeStrategy]: list }
    })
  }

  const handleExecute = useCallback(async () => {
    const peakUsers =
      currentParams.find((p) => p.label.includes('峰值') || p.label.includes('恒定'))?.value ?? 100
    const spawnRate = currentParams.find((p) => p.label === '孵化率')?.value ?? 10
    const runTimeParam = runUntilStop ? undefined : `${durationMinutes}m`

    setExecuting(true)
    try {
      const res = await startSwarm({
        user_count: peakUsers,
        spawn_rate: spawnRate,
        run_time: runTimeParam,
      })
      if (res.success) {
        message.success(res.message || '压测已启动')
      } else {
        message.error(res.message || '启动失败')
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '启动压测失败，请确认 Locust 已运行')
    } finally {
      setExecuting(false)
    }
  }, [currentParams, durationMinutes, runUntilStop])

  return (
    <div className="test-task-panel">
      <div className="glass-card task-toolbar">
        <div className="toolbar-left">
          <Input
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="任务名称"
            style={{ width: 320 }}
          />
        </div>
        <div className="toolbar-right">
          <Button>保存草稿</Button>
          <Button
            type="primary"
            loading={executing}
            onClick={handleExecute}
            style={{ background: THEME, borderColor: THEME }}
          >
            立即执行
          </Button>
        </div>
      </div>

      <div className="glass-card section">
        <div className="section-header">
          <h3 className="section-title">选择测试场景</h3>
          <span className="section-tip">支持多选，可通过 @标签 批量选择</span>
        </div>
        <div className="scenario-toolbar">
          <Input
            value={scenarioSearch}
            onChange={(e) => setScenarioSearch(e.target.value)}
            placeholder="🔍 按场景名称搜索"
            style={{ width: 200 }}
            size="small"
          />
          <Select
            mode="multiple"
            value={selectedTags}
            onChange={setSelectedTags}
            placeholder="按标签选择"
            style={{ width: 160 }}
            size="small"
            options={allTags.map((t) => ({ label: t, value: t }))}
          />
          <div className="selected-tags">
            {selectedTags.map((tag) => (
              <span key={tag} className="tag-badge">
                #{tag}
                <CloseOutlined
                  className="tag-remove"
                  onClick={() => setSelectedTags((t) => t.filter((x) => x !== tag))}
                />
              </span>
            ))}
          </div>
        </div>
        {filteredGroups.map((group) => (
          <div key={group.name} className="scenario-group">
            <div className="group-name">
              {group.name} ({group.items.length} 个场景)
            </div>
            {group.items.map((item) => (
              <div key={item.name} className="scenario-item">
                <Checkbox
                  checked={item.checked}
                  onChange={(e) => toggleScenario(group.name, item.name, e.target.checked)}
                />
                <span className="scenario-name">{item.name}</span>
                <span className="scenario-tags">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="tag-dot"
                      style={{ backgroundColor: TAG_COLORS[tag] ?? '#999' }}
                    />
                  ))}
                </span>
                <span className={`scenario-rate${item.successRate < 99 ? ' rate-warn' : ''}`}>
                  {item.successRate}%
                </span>
              </div>
            ))}
          </div>
        ))}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          场景列表为本地演示数据，接入场景库 API 后可动态加载
        </Typography.Text>
      </div>

      <div className="glass-card section">
        <div className="section-header">
          <h3 className="section-title">测试策略</h3>
          <Typography.Link style={{ color: THEME }}>管理策略库</Typography.Link>
        </div>
        <div className="strategy-templates">
          {STRATEGY_TEMPLATES.map((tpl) => (
            <button
              key={tpl}
              type="button"
              className={`tpl-btn${activeStrategy === tpl ? ' active' : ''}`}
              onClick={() => setActiveStrategy(tpl)}
            >
              {tpl}
            </button>
          ))}
        </div>
        <div className="preview-chart">
          <ReactECharts option={chartOption} style={{ height: 160 }} notMerge />
        </div>
        <div className="params-grid">
          {currentParams.map((param, idx) => (
            <div key={param.label} className="param-item">
              <span className="param-label">{param.label}:</span>
              <InputNumber
                size="small"
                min={param.min}
                max={param.max}
                value={param.value}
                onChange={(v) => updateParam(idx, v)}
                style={{ width: 100 }}
              />
              {param.unit && <span className="param-unit">{param.unit}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card section">
        <div className="section-header">
          <h3 className="section-title">执行时间设置</h3>
        </div>
        <div className="schedule-form">
          <div className="schedule-row">
            <span className="label">执行方式：</span>
            <Radio.Group
              value={executeMode}
              onChange={(e) => setExecuteMode(e.target.value)}
            >
              <Radio value="immediate">立即执行</Radio>
              <Radio value="scheduled">定时执行</Radio>
            </Radio.Group>
          </div>
          {executeMode === 'scheduled' && (
            <div className="schedule-row">
              <span className="label">执行时间：</span>
              <DatePicker
                showTime
                value={scheduledTime}
                onChange={setScheduledTime}
                placeholder="选择日期时间"
              />
            </div>
          )}
          <div className="schedule-row">
            <span className="label">执行时长：</span>
            <InputNumber
              size="small"
              min={1}
              max={999}
              value={durationMinutes}
              onChange={(v) => v != null && setDurationMinutes(v)}
              style={{ width: 80 }}
            />
            <span className="param-unit">分钟</span>
            <Checkbox checked={runUntilStop} onChange={(e) => setRunUntilStop(e.target.checked)}>
              持续运行直到手动停止
            </Checkbox>
          </div>
        </div>
      </div>

      <div className="glass-card section">
        <Collapse
          items={[
            {
              key: 'advanced',
              label: '高级选项',
              children: (
                <>
                  <div className="adv-block">
                    <h4 className="adv-title">思考时间设置</h4>
                    <Radio.Group value={thinkMode} onChange={(e) => setThinkMode(e.target.value)}>
                      <Space>
                        <Radio value="none">无等待</Radio>
                        <Radio value="fixed">固定等待</Radio>
                        <Radio value="random">随机等待</Radio>
                      </Space>
                    </Radio.Group>
                    {thinkMode === 'fixed' && (
                      <div className="schedule-row" style={{ marginTop: 8 }}>
                        <span className="label">固定等待：</span>
                        <InputNumber min={0.1} step={0.1} value={fixedWait} onChange={(v) => v != null && setFixedWait(v)} size="small" />
                        <span className="param-unit">秒</span>
                      </div>
                    )}
                    {thinkMode === 'random' && (
                      <div className="schedule-row" style={{ marginTop: 8 }}>
                        <span className="label">随机等待范围：</span>
                        <InputNumber min={0.1} step={0.1} value={randomWaitMin} onChange={(v) => v != null && setRandomWaitMin(v)} size="small" />
                        <span>-</span>
                        <InputNumber min={0.1} step={0.1} value={randomWaitMax} onChange={(v) => v != null && setRandomWaitMax(v)} size="small" />
                        <span className="param-unit">秒</span>
                      </div>
                    )}
                  </div>
                  <div className="adv-block">
                    <h4 className="adv-title">数据参数化</h4>
                    <Space direction="vertical">
                      <Checkbox checked={enableCsv} onChange={(e) => setEnableCsv(e.target.checked)}>
                        启用 CSV 数据文件
                      </Checkbox>
                      {enableCsv && (
                        <>
                          <Space>
                            <span>文件路径：</span>
                            <Input size="small" value={csvPath} onChange={(e) => setCsvPath(e.target.value)} style={{ width: 240 }} />
                          </Space>
                          <Space>
                            <span>数据分配：</span>
                            <Radio.Group value={dataAlloc} onChange={(e) => setDataAlloc(e.target.value)} size="small">
                              <Radio value="sequential">顺序读取</Radio>
                              <Radio value="loop">循环读取</Radio>
                              <Radio value="random">随机读取</Radio>
                            </Radio.Group>
                          </Space>
                        </>
                      )}
                      <Checkbox checked={enableDynamicData} onChange={(e) => setEnableDynamicData(e.target.checked)}>
                        动态生成数据
                      </Checkbox>
                    </Space>
                  </div>
                  <div className="adv-block">
                    <h4 className="adv-title">分布式执行</h4>
                    <Space direction="vertical">
                      <Checkbox checked={enableDistributed} onChange={(e) => setEnableDistributed(e.target.checked)}>
                        启用分布式模式
                      </Checkbox>
                      {enableDistributed && (
                        <>
                          <Space>
                            <span>Worker 节点数：</span>
                            <InputNumber min={1} value={workerCount} onChange={(v) => v != null && setWorkerCount(v)} size="small" />
                          </Space>
                          <Space>
                            <span>Master 地址：</span>
                            <Input size="small" value={masterUrl} onChange={(e) => setMasterUrl(e.target.value)} style={{ width: 240 }} />
                          </Space>
                          <Space>
                            <span>期望 Worker 数：</span>
                            <InputNumber min={1} value={expectedWorkers} onChange={(v) => v != null && setExpectedWorkers(v)} size="small" />
                          </Space>
                        </>
                      )}
                    </Space>
                  </div>
                  <div className="adv-block">
                    <h4 className="adv-title">结果输出配置</h4>
                    <Space direction="vertical">
                      <Checkbox checked={autoSaveReport} onChange={(e) => setAutoSaveReport(e.target.checked)}>
                        自动保存测试报告
                      </Checkbox>
                      <Checkbox checked={exportCsv} onChange={(e) => setExportCsv(e.target.checked)}>
                        输出 CSV 统计数据
                      </Checkbox>
                      {exportCsv && (
                        <Space>
                          <span>输出路径：</span>
                          <Input size="small" value={outputPath} onChange={(e) => setOutputPath(e.target.value)} style={{ width: 200 }} />
                        </Space>
                      )}
                      <Checkbox checked={enableWebSocket} onChange={(e) => setEnableWebSocket(e.target.checked)}>
                        实时推送数据到 WebSocket
                      </Checkbox>
                      <Checkbox checked={enablePrometheus} onChange={(e) => setEnablePrometheus(e.target.checked)}>
                        导出 Prometheus 格式
                      </Checkbox>
                    </Space>
                  </div>
                </>
              ),
            },
          ]}
        />
      </div>

      <div className="glass-card bottom-summary-card">
        <div className="bottom-summary">
          {summaryItems.map((item) => (
            <span key={item.label} className="summary-item">
              <span className="summary-label">{item.label}:</span>
              <span className="summary-value">{item.value}</span>
            </span>
          ))}
        </div>
        <div className="bottom-actions">
          <Button size="small">保存草稿</Button>
          <Button
            size="small"
            type="primary"
            loading={executing}
            onClick={handleExecute}
            style={{ background: THEME, borderColor: THEME }}
          >
            立即执行
          </Button>
        </div>
      </div>
    </div>
  )
}
