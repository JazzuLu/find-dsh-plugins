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
