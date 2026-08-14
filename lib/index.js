// DeepSeek account dashboard — host side.
//
// Reads the DeepSeek API key from the dsh credential store (never ships it to
// the browser), serves account balance and token-usage data over loopback-only
// HTTP routes for the browser widget (lib/client.js).
//
// Token usage is aggregated from dsh's own session event logs
// (~/.dsh/sessions/**/session.jsonl[.zstd]): every `assistant/message` event
// carries the provider-reported usage (`data.usage`, normalized buckets), so
// no extra API is needed. Live sessions are captured in-process through the
// `session/event` hook, and the per-day totals are persisted to
// ~/.dsh/storages/deepseek-account/usage.json so the dashboard survives
// restarts and answers range queries (today / 3d / 7d / 30d / 365d / total).
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

export const name = 'deepseek-account'
export const inject = ['webServer']

const BALANCE_ENDPOINT = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 10_000
const RESCAN_TTL_MS = 1_500
const DAY_MS = 86_400_000
const MAX_POINTS = 400
const USAGE_RANGES = new Set(['today', '3d', '7d', '30d', '365d', 'total'])

// ---------------------------------------------------------------- helpers

const dshHome = () => process.env.DSH_HOME || join(homedir(), '.dsh')
const storeDir = () => join(dshHome(), 'storages', 'deepseek-account')
const storeFile = () => join(storeDir(), 'usage.json')

function readApiKey() {
  try {
    const text = readFileSync(join(dshHome(), '.credentials.yaml'), 'utf8')
    const match = text.match(/^\s*DEEPSEEK_API_KEY\s*[:=]\s*["']?([^"'\s]+)/m)
    if (match && match[1]) return match[1]
  } catch {
    /* credential file absent — fall through */
  }
  return process.env.DEEPSEEK_API_KEY || null
}

function dayKey(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ------------------------------------------------------------------- store

function emptyStore() {
  return { days: {}, sources: {} }
}

function loadStore() {
  try {
    const raw = JSON.parse(readFileSync(storeFile(), 'utf8'))
    return { ...emptyStore(), ...raw }
  } catch {
    return emptyStore()
  }
}

function saveStore(store) {
  try {
    mkdirSync(storeDir(), { recursive: true })
    const tmp = storeFile() + '.tmp'
    writeFileSync(tmp, JSON.stringify(store))
    renameSync(tmp, storeFile())
  } catch (error) {
    console.error(`[deepseek-account] save store failed: ${error?.message ?? error}`)
  }
}

function addUsage(store, timeMs, usage) {
  const day = dayKey(timeMs)
  const bucket = (store.days[day] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  bucket.input += usage.inputTokens ?? 0
  bucket.output += usage.outputTokens ?? 0
  bucket.cacheRead += usage.cacheReadTokens ?? 0
  bucket.cacheWrite += usage.cacheWriteTokens ?? 0
}

// -------------------------------------------------------- session scanning

function* sessionLogFiles() {
  const root = join(dshHome(), 'sessions')
  if (!existsSync(root)) return
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(path)
      } else if (entry.isFile() && (entry.name === 'session.jsonl' || entry.name === 'session.jsonl.zstd')) {
        yield path
      }
    }
  }
}

function parseLog(buf) {
  const text = typeof buf === 'string' ? buf : buf.toString('utf8')
  const events = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const event = JSON.parse(trimmed)
      if (event && typeof event === 'object' && typeof event.type === 'string' && event.type !== 'session') {
        events.push(event)
      }
    } catch {
      /* partial line at the tail — skip */
    }
  }
  return events
}

/**
 * Incrementally fold provider-reported usage out of session logs into the
 * per-day store. Files are tracked by (mtimeMs, size), so unchanged logs are
 * skipped on every later pass.
 */
function backfill(store) {
  let changed = false
  for (const file of sessionLogFiles()) {
    let stat
    try {
      stat = statSync(file)
    } catch {
      continue
    }
    const prev = store.sources[file]
    if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) continue
    try {
      const buf = file.endsWith('.zstd') ? zstdDecompressSync(readFileSync(file)) : readFileSync(file, 'utf8')
      for (const event of parseLog(buf)) {
        if (event.type === 'assistant/message' && event.data && event.data.usage) {
          addUsage(store, typeof event.time === 'number' ? event.time : Date.now(), event.data.usage)
        }
      }
    } catch (error) {
      console.error(`[deepseek-account] skip session log ${file}: ${error?.message ?? error}`)
    }
    store.sources[file] = { mtimeMs: stat.mtimeMs, size: stat.size }
    changed = true
  }
  if (changed) saveStore(store)
  return changed
}

// --------------------------------------------------------------- aggregation

function buildPoints(keys, store) {
  const points = keys.map((key) => {
    const b = store.days[key] || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    return {
      date: key,
      input: b.input,
      output: b.output,
      cacheRead: b.cacheRead,
      cacheWrite: b.cacheWrite,
      total: b.input + b.output + b.cacheRead + b.cacheWrite,
    }
  })
  const summary = points.reduce(
    (acc, p) => {
      acc.inputTokens += p.input
      acc.outputTokens += p.output
      acc.cacheReadTokens += p.cacheRead
      acc.cacheWriteTokens += p.cacheWrite
      return acc
    },
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  )
  summary.totalTokens =
    summary.inputTokens + summary.outputTokens + summary.cacheReadTokens + summary.cacheWriteTokens
  summary.days = points.length
  return { points, summary }
}

function rangePoints(store, range) {
  const now = Date.now()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const todayStart = startOfToday.getTime()
  const todayEnd = todayStart + DAY_MS - 1

  if (range === 'total') {
    const days = Object.keys(store.days)
      .filter((d) => {
        const b = store.days[d]
        return b.input + b.output + b.cacheRead + b.cacheWrite > 0
      })
      .sort()
      .slice(-MAX_POINTS)
    return buildPoints(days, store)
  }

  const spans = { today: 1, '3d': 3, '7d': 7, '30d': 30, '365d': 365 }
  const span = spans[range] ?? 7
  let fromMs = todayStart - (span - 1) * DAY_MS
  const toMs = Math.min(fromMs + span * DAY_MS - 1, todayEnd)
  if (toMs - fromMs >= MAX_POINTS * DAY_MS) fromMs = toMs - (MAX_POINTS - 1) * DAY_MS
  const keys = []
  for (let t = fromMs; t <= toMs; t += DAY_MS) keys.push(dayKey(t))
  return buildPoints(keys, store)
}

// ------------------------------------------------------------------ balance

let balanceCache = null

async function getBalance(key) {
  if (balanceCache && Date.now() - balanceCache.at < BALANCE_TTL_MS) return balanceCache.data
  const res = await fetch(BALANCE_ENDPOINT, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`DeepSeek balance API HTTP ${res.status}`)
  const data = await res.json()
  balanceCache = { at: Date.now(), data }
  return data
}

// ------------------------------------------------------------------- routes

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

// --------------------------------------------------------------------- apply

export function apply(ctx) {
  const store = loadStore()
  let lastScan = 0

  const ensureFresh = () => {
    const now = Date.now()
    if (now - lastScan < RESCAN_TTL_MS) return
    lastScan = now
    try {
      backfill(store)
    } catch (error) {
      console.error(`[deepseek-account] backfill failed: ${error?.message ?? error}`)
    }
  }

  // Live sessions: fold provider usage the moment it lands, so "today" stays
  // current even before the session log is flushed to disk.
  let saveTimer = null
  const scheduleSave = () => {
    if (saveTimer !== null) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      try {
        saveStore(store)
      } catch {
        /* never throw from a timer */
      }
    }, 2000)
  }
  if (typeof ctx.on === 'function') {
    ctx.on('session/event', (session) => {
      try {
        const events = session?.events
        const event = events?.[events.length - 1]
        if (event && event.type === 'assistant/message' && event.data && event.data.usage) {
          addUsage(store, typeof event.time === 'number' ? event.time : Date.now(), event.data.usage)
          scheduleSave()
        }
      } catch {
        /* a malformed live event must never break the session */
      }
    })
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      scope.webServer.register({
        name: 'deepseek-account-status',
        kind: 'exact',
        path: '/deepseek-account/status',
        handler: async (_req, res) => {
          const key = readApiKey()
          let balance = null
          let balanceError = null
          if (!key) {
            balanceError = '未找到 DEEPSEEK_API_KEY（~/.dsh/.credentials.yaml 或环境变量）'
          } else {
            try {
              balance = await getBalance(key)
            } catch (error) {
              balanceError = error?.message ?? String(error)
            }
          }
          sendJson(res, 200, { ok: true, keyConfigured: Boolean(key), balance, balanceError, updatedAt: Date.now() })
        },
      })
      scope.webServer.register({
        name: 'deepseek-account-usage',
        kind: 'exact',
        path: '/deepseek-account/usage',
        handler: (req, res) => {
          ensureFresh()
          let range = '7d'
          try {
            const query = new URL(req.url ?? '/', 'http://dsh.local').searchParams.get('range')
            if (query && USAGE_RANGES.has(query)) range = query
          } catch {
            /* keep default */
          }
          sendJson(res, 200, { ok: true, range, ...rangePoints(store, range), updatedAt: Date.now() })
        },
      })
    })
  }

  // Warm the store shortly after boot so the first panel open is fast.
  setImmediate(() => {
    try {
      ensureFresh()
    } catch {
      /* boot must never fail on stats */
    }
  })
}
