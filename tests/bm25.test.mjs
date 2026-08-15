// tests/bm25.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, searchTopK } from '../scripts/search.mjs'

test('tokenize 中文 bigram 与英文分词', () => {
  const tokens = tokenize('统计token用量的插件')
  assert.ok(tokens.includes('统计'))
  assert.ok(tokens.includes('计用'))
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

test('searchTopK 支持 description 为 {en,zh} 对象（索引形态）', () => {
  const plugins = [
    { id: 'pet', name: 'dsh-pet', description: { zh: 'DSH Web UI 桌面宠物：精灵图动画', en: 'Desktop pet' }, categories: [], topics: [] },
    { id: 'board', name: 'dsh-task-board', description: { zh: '任务看板', en: 'Task board' }, categories: [], topics: [] },
  ]
  const top = searchTopK('桌面宠物', plugins, 1)
  assert.equal(top.length, 1)
  assert.equal(top[0].plugin.id, 'pet')
})
