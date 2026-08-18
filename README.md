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

### 方式 1：通过 Skills CLI 安装（推荐，支持各类 Agent）

可直接通过 [skills.sh](https://skills.sh) 官方 CLI 一键安装到你的 AI Agent 环境（Claude Code, Cursor, Codex, Antigravity 等）：

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
