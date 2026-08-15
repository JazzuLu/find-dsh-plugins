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
