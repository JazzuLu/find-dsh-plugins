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
import { pathToFileURL } from 'node:url'
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const repo = process.argv[2]
  if (!repo) {
    console.error('用法: node scripts/audit.mjs <owner/repo>')
    process.exit(1)
  }
  const result = await auditRepo(repo)
  console.log(JSON.stringify(result, null, 2))
}
