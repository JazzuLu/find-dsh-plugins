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
