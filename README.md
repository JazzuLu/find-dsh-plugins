# find-dsh-plugins

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![License](https://img.shields.io/github/license/JazzuLu/find-dsh-plugins)](LICENSE)
[![Stars](https://img.shields.io/github/stars/JazzuLu/find-dsh-plugins)](https://github.com/JazzuLu/find-dsh-plugins)

中文 | [English](README.en.md)

**对话式查找 DeepSeek Harness 插件的增强版 skill —— 语义检索 × 四源聚合 × 安全审计。**

问一句"有没有能统计 token 用量的插件？"，Agent 检索四源统一索引、语义精排、
给出带安全标记的候选表，拍板后安全安装并验证。

<img src="assets/demo.png" alt="find-dsh-plugins 对话演示" width="640">

## 目录

1. [与别人的差异](#与别人的差异)
2. [支持哪些 Agent](#支持哪些-agent)
3. [快速开始](#快速开始)
4. [使用示例](#使用示例)
5. [工作原理](#工作原理)
6. [兼容性](#兼容性)
7. [数据源与更新机制](#数据源与更新机制)
8. [数据源与致谢](#数据源与致谢)
9. [安全模型](#安全模型)
10. [FAQ](#faq)
11. [开发与贡献](#开发与贡献)
12. [LICENSE](#license)

## 与别人的差异

| 能力 | find-dsh-plugins（本仓库） | dsh-find-plugins | dsh-find-plugin | dsh-plugin-finder |
|---|---|---|---|---|
| 检索方式 | BM25 粗筛 + LLM 语义精排 | 关键词匹配 | 关键词 + stars 重排 | 注册表单源匹配 |
| 数据源 | 四源聚合（岚叔/awesome/dsh.so/GitHub topic） | GitHub topic 单源 | 2 源 | dsh.so 单源 |
| 安全审计 | evidence 分级 + 本地静态审计 | 无 | 无 | 无 |
| 形态 | skill 免重启 | skill | 插件需重启 | 插件需重启 |
| 数据新鲜度 | 分层 TTL + 查询时同步刷新 | 每次现拉 | 5 分钟缓存 | - |

## 支持哪些 Agent

遵循业界通用的 Agent Skills（`SKILL.md`）开放规范，同一份技能本体可被多家 Agent 加载：

| Agent | 安装方式 | 说明 |
| --- | --- | --- |
| skills.sh 生态（Claude Code / Cursor / Codex 等） | `npx skills add JazzuLu/find-dsh-plugins` | 标准 `SKILL.md`，skills.sh 原生支持 |
| DeepSeek Harness (dsh) | 复制目录到 `~/.dsh/skills/`，或 `dsh plugin add github:JazzuLu/find-dsh-plugins` | dsh skill-filesystem 扫描该目录，watcher 即时加载 |
| 其余遵循 Agent Skills 规范的 Agent | 按各自文档中的 skills 目录放置 | 同一份 `SKILL.md` 直接可用 |

## 快速开始

### 方式 1：Skills CLI 安装（推荐，支持各类 Agent）

```sh
# 项目级安装
npx skills add JazzuLu/find-dsh-plugins

# 或全局安装（对当前用户的所有项目生效）
npx skills add JazzuLu/find-dsh-plugins -g
```

### 方式 2：手动复制到 DSH 目录（DSH 专用，免重启）

```sh
# 1. 复制 skill 运行目录（仅 AI 运行所需文件：指令 + 脚本 + 参考）
mkdir -p ~/.dsh/skills/find-dsh-plugins
cp -r SKILL.md scripts references ~/.dsh/skills/find-dsh-plugins/

# 2. 新会话（或当前会话等待 watcher 加载）
# 3. 直接对话：
#    "有没有能统计 token 用量的插件？"
#    "帮我装个 SSH 远程运维面板"
#    "生态里有什么好玩的 UI 增强插件？"
```

### 方式 3：bundle 安装（DSH，需重启 dsh web）

```sh
dsh plugin --profile web add github:JazzuLu/find-dsh-plugins
dsh web   # 重启加载
```

### 升级 / 卸载

```sh
# 升级（bundle 方式）：重新执行安装命令
dsh plugin --profile web add github:JazzuLu/find-dsh-plugins

# 卸载（bundle 方式）：务必用包名，不要传本地路径
dsh plugin --profile web remove find-dsh-plugins

# 卸载（复制方式）：删除目录即可
rm -rf ~/.dsh/skills/find-dsh-plugins
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

## 兼容性

- **Node.js ≥ 22**：脚本使用内置 `fetch` 与 `node:test`，零第三方依赖。
- **网络**：需要访问四个数据源（岚叔 / awesome-dsh-plugin / dsh.so / GitHub API）。
- **DSH**：实测 0.1.x 系列（web profile）；与各 Agent 的 `SKILL.md` 加载器通用。

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

## FAQ

**Q: 为什么结果偶尔不是最新？**
A: 索引按分层 TTL 自动刷新（curated 30 分钟 / GitHub 增量 15 分钟 / 全量每日），
查询时过期层会同步刷新——拿到的是"查询时刻能拿到的最新状态"，不可能比源头更新。

**Q: 没找到插件怎么办？**
A: SKILL.md 会先换一组同义词重试一次；仍无结果说明生态里真没有，可转
make-dsh-plugin 现写一个。

**Q: 安全审计会执行插件代码吗？**
A: 不会。静态审计只读 package.json 与 README 文本（lifecycle 脚本、写路径、
shell 配置关键词），不装依赖、不运行代码。

**Q: 需要 API key 或付费吗？**
A: 不需要。BM25 粗筛在本地零成本执行，LLM 精排复用当前会话的模型，无外部 API 调用。

**Q: 和 dsh-find-plugin / dsh-plugin-finder 有什么区别？**
A: 见[与别人的差异](#与别人的差异)对比表——语义检索、四源聚合、安全审计是三项核心差异。

## 开发与贡献

- 测试：`npm test`（node:test，零依赖）。
- 脚本：build-index.mjs（索引）、search.mjs（检索）、audit.mjs（审计）。
- PR 欢迎：修正数据源字段映射、补充审计规则、提升 BM25 权重。

## LICENSE

BSD-3-Clause。代码全部原创，不继承任何上游实现。
