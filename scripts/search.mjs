// scripts/search.mjs
// BM25 检索核心（纯函数，可被 tests 直接 import；CLI 入口在 Task 7 追加）

export function tokenize(text) {
  const lower = String(text).toLowerCase()
  const tokens = []
  for (const m of lower.matchAll(/[a-z0-9]+/g)) tokens.push(m[0])
  const cjk = lower.replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk.slice(i, i + 2))
  return tokens
}

function docFreq(plugins, getTokens) {
  const df = new Map()
  for (const p of plugins) {
    for (const t of new Set(getTokens(p))) df.set(t, (df.get(t) ?? 0) + 1)
  }
  return df
}

export function bm25(queryTokens, docTokens, df, N, avgdl, dl, k1 = 1.5, b = 0.75) {
  let score = 0
  for (const t of queryTokens) {
    const tf = docTokens.filter((x) => x === t).length
    if (tf === 0) continue
    const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl) / avgdl)))
  }
  return score
}

export function searchTopK(query, plugins, k = 30) {
  const weights = { name: 1.5, description: 1.0, categories: 0.5, topics: 0.5 }
  const fieldText = (p) => {
    const parts = []
    parts.push(...Array(Math.round(weights.name)).fill(p.name ?? ''))
    const desc = typeof p.description === 'string'
      ? p.description
      : [p.description?.zh, p.description?.en].filter(Boolean).join(' ')
    parts.push(desc)
    parts.push(...(p.categories ?? []).map((c) => c.replace(/[-_]/g, ' ')))
    parts.push(...(p.topics ?? []))
    return parts.join(' ')
  }
  const queryTokens = tokenize(query)
  const docs = plugins.map((p) => ({ p, tokens: tokenize(fieldText(p)) }))
  const df = docFreq(plugins, (p) => tokenize(fieldText(p)))
  const N = docs.length
  const avgdl = N === 0 ? 1 : docs.reduce((s, d) => s + d.tokens.length, 0) / N
  const scored = docs
    .map((d) => ({ plugin: d.p, score: bm25(queryTokens, d.tokens, df, N, avgdl, d.tokens.length) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
  return scored
}

// ===== CLI 入口（Task 7）=====
import { pathToFileURL } from 'node:url'
import { buildIndex } from './build-index.mjs'

async function main() {
  const args = process.argv.slice(2)
  const topFlag = args.indexOf('--top')
  const top = topFlag >= 0 ? Number(args[topFlag + 1]) : 30
  const asJson = args.includes('--json')
  const query = args.find((a) => !a.startsWith('--'))
  if (!query) {
    console.error('用法: node scripts/search.mjs "<需求描述>" [--top N] [--json]')
    process.exit(1)
  }
  const { index } = await buildIndex()
  const hits = searchTopK(query, index.plugins, top)
  if (asJson) {
    console.log(JSON.stringify(hits.map((h) => ({ plugin: h.plugin, score: h.score }))))
    return
  }
  console.log(`共 ${index.plugins.length} 个候选，命中 ${hits.length} 个（数据源状态: ${JSON.stringify(index.sources)}）`)
  for (const h of hits) {
    const p = h.plugin
    console.log(`- ${p.name}  ★${p.stars}  [${p.evidence.level}]  ${p.repo}`)
    console.log(`    ${p.description.zh || p.description.en || ''}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
