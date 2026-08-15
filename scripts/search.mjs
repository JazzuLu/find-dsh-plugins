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
    parts.push(p.description ?? '')
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
