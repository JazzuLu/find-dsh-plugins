// scripts/build-index.mjs
// 四源规范化与统一索引合并（纯函数；CLI 入口在 Task 6 追加）

const EVIDENCE_RANK = { LISTED: 4, CURATED: 3, INDEXED: 2, TOPIC: 1, TOPIC_ONLY: 0 }
// 描述来源优先级：手写双语源（岚叔/awesome）优先于聚合源（dsh.so）与自动抓取（github）
const DESC_PRIORITY = { lanshu: 3, awesome: 2, dshso: 1, github: 0 }
const hasText = (d) => Boolean(d && ((d.zh && d.zh.length > 0) || (d.en && d.en.length > 0)))

function entry(seed) {
  return {
    key: seed.repo.toLowerCase(),
    repo: seed.repo,
    url: seed.url,
    name: seed.name,
    description: seed.description ?? { en: '', zh: '' },
    stars: seed.stars ?? 0,
    pushedAt: seed.pushedAt ?? '',
    categories: seed.categories ?? [],
    evidence: seed.evidence,
    sources: seed.sources,
    npm: seed.npm,
  }
}

export function normalizeLanshu(p) {
  const repo = p.repo ?? p.id
  return entry({
    repo,
    url: p.url ?? `https://github.com/${repo}`,
    name: p.name,
    description: p.description ?? { en: '', zh: '' },
    stars: p.stars ?? 0,
    pushedAt: p.pushedAt ?? '',
    categories: p.category ? [p.category] : [],
    evidence: {
      level: p.curated ? 'LISTED' : 'TOPIC',
      source: 'lanshu',
      screening: p.screening ?? null,
      attention: p.attention ?? null,
    },
    sources: ['lanshu'],
  })
}

export function normalizeAwesome(p) {
  return entry({
    repo: (p.url ?? '').replace(/^https?:\/\/github\.com\//, '') || p.name,
    url: p.url,
    name: p.name,
    description: p.description ?? { en: '', zh: '' },
    stars: p.stars ?? 0,
    pushedAt: '',
    categories: p.category ? [p.category] : [],
    evidence: { level: 'CURATED', source: 'awesome' },
    sources: ['awesome'],
    npm: p.npm,
  })
}

export function normalizeDshso(p) {
  const desc = typeof p.description === 'string' ? { en: p.description, zh: p.description } : p.description
  return entry({
    repo: p.id,
    url: p.url ?? `https://github.com/${p.id}`,
    name: p.name ?? p.id,
    description: desc ?? { en: '', zh: '' },
    stars: p.stars ?? 0,
    pushedAt: '',
    categories: (p.topics ?? []).slice(0, 3),
    evidence: { level: 'INDEXED', source: 'dshso' },
    sources: ['dshso'],
  })
}

export function normalizeGithub(r) {
  const desc = { en: r.description ?? '', zh: r.description ?? '' }
  return entry({
    repo: r.full_name,
    url: r.html_url,
    name: r.name,
    description: desc,
    stars: r.stargazers_count ?? 0,
    pushedAt: r.pushed_at ?? '',
    categories: (r.topics ?? []).filter((t) => t !== 'dsh-plugin').slice(0, 3),
    evidence: { level: 'TOPIC', source: 'github' },
    sources: ['github'],
  })
}

export function mergePlugins(entries) {
  const byKey = new Map()
  for (const e of entries) {
    const cur = byKey.get(e.key)
    if (!cur) {
      byKey.set(e.key, { ...e, sources: [...e.sources], categories: [...e.categories] })
      continue
    }
    cur.sources = [...new Set([...cur.sources, ...e.sources])]
    cur.evidence =
      EVIDENCE_RANK[e.evidence.level] > EVIDENCE_RANK[cur.evidence.level] ? e.evidence : cur.evidence
    if (hasText(e.description)) {
      const curPriority = DESC_PRIORITY[cur.sources[0]] ?? 0
      const ePriority = DESC_PRIORITY[e.sources[0]] ?? 0
      if (ePriority > curPriority || !hasText(cur.description)) {
        cur.description = e.description
      }
    }
    if (e.stars > cur.stars) cur.stars = e.stars
    if (e.pushedAt > cur.pushedAt) cur.pushedAt = e.pushedAt
    if (!cur.npm && e.npm) cur.npm = e.npm
  }
  const plugins = [...byKey.values()].map((p) => ({
    ...p,
    id: p.repo.split('/').pop() ?? p.name,
    installHint: 'unknown',
  }))
  return plugins
}

// ===== 分层新鲜度与缓存（Task 4）=====
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const CACHE_DIR = join(__dirname, '..', '.cache')
export const INDEX_PATH = join(CACHE_DIR, 'index.json')
export const META_PATH = join(CACHE_DIR, 'meta.json')
export const LAYER_TTL_MS = {
  curated: 30 * 60_000,
  githubIncremental: 15 * 60_000,
  githubFull: 24 * 3600_000,
}

export function isLayerFresh(meta, layer, now = Date.now()) {
  const at = meta?.layers?.[layer]?.at
  if (typeof at !== 'number') return false
  return now - at < LAYER_TTL_MS[layer]
}

export function ensureCacheDir() {
  mkdirSync(CACHE_DIR, { recursive: true })
}

// ===== 四源拉取与 CLI（Task 6）=====
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export async function fetchSource(name, url, parse, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(25_000), headers: { 'user-agent': 'find-dsh-plugins' } })
    if (!res.ok) return { ok: false, count: 0, entries: [], error: `HTTP ${res.status}` }
    const data = await res.json()
    const entries = await parse(data)
    return { ok: true, count: entries.length, entries }
  } catch (err) {
    return { ok: false, count: 0, entries: [], error: String(err.message ?? err) }
  }
}

const GITHUB_TOPIC_QUERY = 'topic:dsh-plugin is:public archived:false'

async function fetchGithubTopic(pages) {
  const all = []
  for (let page = 1; page <= pages; page += 1) {
    const url = new URL('https://api.github.com/search/repositories')
    url.searchParams.set('q', GITHUB_TOPIC_QUERY)
    url.searchParams.set('sort', 'updated')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    const r = await fetchSource('github', url.toString(), (d) => d.items ?? [], fetch)
    if (!r.ok) break
    all.push(...r.entries)
  }
  return all.map(normalizeGithub)
}

export async function buildIndex(opts = {}) {
  const { fetchImpl = fetch, now = Date.now() } = opts
  const meta = readMeta() ?? { layers: {} }
  const sources = { lanshu: { ok: true }, awesome: { ok: true }, dshso: { ok: true }, githubTopic: { ok: true } }
  const entries = []
  const curatedFresh = isLayerFresh(meta, 'curated', now)
  if (curatedFresh) {
    const cached = readIndex()
    if (cached) return { index: cached, meta, cached: true }
  }
  const curated = await Promise.all([
    fetchSource('lanshu', 'https://dsh.lanshuagent.com/api/plugins', (d) => d.plugins.map(normalizeLanshu), fetchImpl),
    fetchSource('awesome', 'https://awesome-dsh-plugin.com/plugins.json', (d) => d.plugins.map(normalizeAwesome), fetchImpl),
    fetchSource('dshso', 'https://www.dsh.so/plugins-index.json', (d) => d.plugins.map(normalizeDshso), fetchImpl),
  ])
  const CURATED_NAMES = ['lanshu', 'awesome', 'dshso']
  for (let i = 0; i < curated.length; i += 1) {
    const r = curated[i]
    sources[CURATED_NAMES[i]] = { ok: r.ok }
    if (r.ok) entries.push(...r.entries)
  }
  const githubFull = !isLayerFresh(meta, 'githubFull', now)
  const githubIncremental = !isLayerFresh(meta, 'githubIncremental', now)
  if (githubIncremental || githubFull) {
    const gh = await fetchGithubTopic(githubFull ? 10 : 2)
    entries.push(...gh)
    if (githubFull) meta.layers.githubFull = { at: now }
    meta.layers.githubIncremental = { at: now }
  }
  const plugins = mergePlugins(entries)
  const index = { schemaVersion: 1, generatedAt: new Date(now).toISOString(), sources, plugins }
  meta.layers.curated = { at: now }
  writeIndex(index, meta)
  return { index, meta, cached: false }
}

function readIndex() {
  try { return JSON.parse(readFileSync(INDEX_PATH, 'utf8')) } catch { return null }
}
function readMeta() {
  try { return JSON.parse(readFileSync(META_PATH, 'utf8')) } catch { return null }
}
function writeIndex(index, meta) {
  ensureCacheDir()
  writeFileSync(INDEX_PATH, JSON.stringify(index))
  writeFileSync(META_PATH, JSON.stringify(meta))
}

// CLI 入口
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const { index, meta } = await buildIndex()
  if (!args.includes('--quiet')) {
    console.log(`索引生成完成: ${index.plugins.length} 个插件`)
    console.log(`数据源状态: ${JSON.stringify(index.sources)}`)
  }
}
