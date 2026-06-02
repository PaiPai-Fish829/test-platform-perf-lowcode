/**
 * 从 config/*.yaml 解析 Locust WebUI 地址（与 config/settings.py 一致）。
 * 供 vite.config.ts 开发代理使用；优先 VITE_LOCUST_URL，其次 Python 读取配置。
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const platformDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(platformDir, '..')

function resolveProjectPython(): string {
  const winPy = path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
  const unixPy = path.join(projectRoot, '.venv', 'bin', 'python')
  if (process.platform === 'win32' && fs.existsSync(winPy)) return winPy
  if (fs.existsSync(unixPy)) return unixPy
  return process.env.PYTHON || 'python'
}

export function resolveLocustTarget(): string {
  const fromEnv = process.env.VITE_LOCUST_URL?.trim()
  if (fromEnv) return fromEnv

  try {
    const py = resolveProjectPython()
    const port = execSync(
      `${JSON.stringify(py)} -c "from config import settings; print(settings.LOCUST_WEB_PORT)"`,
      {
        cwd: projectRoot,
        encoding: 'utf-8',
        env: { ...process.env, PYTHONPATH: projectRoot },
      },
    ).trim()
    if (/^\d+$/.test(port)) {
      return `http://localhost:${port}`
    }
  } catch {
    // 回退默认端口
  }
  return 'http://localhost:8089'
}
