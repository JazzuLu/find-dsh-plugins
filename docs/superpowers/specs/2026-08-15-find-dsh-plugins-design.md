# find-dsh-plugins 设计文档

- 日期：2026-08-15
- 状态：已获用户批准
- 定位：对话式查找 DSH 插件的增强版 skill ——「语义检索 × 四源聚合 × 安全审计」
- 形态：**skill（手册 + 脚本）**，全新仓库，不 fork 任何上游

## 1. 背景与动机

用户希望做"类似 find-skills 的 find-plugin"：让 AI 通过对话帮助用户找到并安装 DSH 插件。
调研结论（2026-08-14）：

- 生态已有 4 个类似实现：Nagi-ovo/dsh-find-plugins（skill）、awesome-dsh-plugin/dsh-find-plugin
  （插件 tool）、ihuajiu/dsh-plugin-finder（插件 tool）、Moximxxx/dsh-find-skill（skill）。
- 已存在 4 个插件注册表/目录：岚叔站点（dsh.lanshuagent.com）、awesome-dsh-plugin.com、
  dsh.so、Oh-My-DSH，外加 GitHub `dsh-plugin` topic 全量（1651 仓库）。
- 现有实现全部为关键词/注册表匹配，无人做语义检索、多源聚合、安全审计的组合。

决策：不重复造轮子，但也不 fork——**全新仓库，吸收各家优点**：
find-skills 的「指令层/逻辑分离」、dsh-find-plugin 的「stars 重排 + 多源描述」、
dsh-plugin-finder 的「自然语言 + 注册表索引」思路，叠加三项差异化。

## 2. 形态决策

- **skill 形态**（SKILL.md 指令层 + scripts 脚本逻辑层），理由：
  1. 核心场景是对话式使用（同 find-skills），无 UI 需求；
  2. skill 免重启、watcher 秒加载（已在环境实测验证）；
  3. 分发即复制目录，社区发布门槛最低；
  4. 确定性逻辑全部下沉脚本，质量可控。
- 短板（已接受）：安装环节是模型执行 `dsh plugin` 命令，安全靠 SKILL.md 硬性规范约束。
- 预留升级路径：若未来需要结构化 tool/权限锁，将脚本能力迁移为插件 host tool，skill 保留为指令层。

## 3. 范围

### P0（首版必做）
1. **多源聚合**：岚叔 live API + awesome-dsh-plugin + dsh.so + GitHub topic 全量 → 统一索引
2. **语义检索**：本地 BM25 粗筛 top-30 + Agent LLM 精排（零外部依赖、零成本）
3. **安全信号**：岚叔 evidence 分级 + 本地静态审计（lifecycle 脚本/写 HOME 外路径/改 shell 配置）
4. **安装可靠**：脚本自动判型（bundle/cordis/skill）+ 装后验证

### 砍掉（YAGNI）
- ⑤体验：索引缓存与中文优先不作为独立功能面；其基础设施价值（TTL 缓存、中英双索引）作为
  实现内部细节保留（见 §5.2 分层新鲜度与 §6.2 描述合并）。

## 4. 仓库与命名

- 仓库/skill 名：`find-dsh-plugins`
- 本地目录：`~/WorkingPlace/Coding/AI/find-dsh-plugins/`
- GitHub 发布：JazzuLu 账号下建公开仓库 `find-dsh-plugins`，打 `dsh-plugin` topic 标签
- LICENSE：BSD-3-Clause（独立授权，代码全部自写，不继承任何上游）

## 5. 架构

### 5.1 目录结构

```
find-dsh-plugins/
├── SKILL.md                         # 指令层：触发、五步流程、精排标准、安全规范、降级策略
├── scripts/
│   ├── build-index.mjs              # 四源拉取 → 统一索引（分层新鲜度 + 本地缓存）
│   ├── search.mjs                   # BM25 粗筛 → top-30 候选 JSON
│   └── audit.mjs                    # 静态安全审计（对 top-3 候选实时执行）
├── references/
│   └── install-methods.md           # 安装流程（bundle/cordis/skill + 安全确认点）
├── tests/
│   ├── bm25.test.mjs                # 中文 bigram 切分、打分排序
│   ├── merge.test.mjs               # 多源合并、去重、evidence 取最严格
│   └── audit.test.mjs               # lifecycle 识别、写路径检测
├── LICENSE                          # BSD-3-Clause
└── README.md                        # 社区门面：差异化对比表 + 快速开始 + 致谢 + 更新引导
```

### 5.2 数据流

```
用户对话："有没有能统计 token 的插件？"
   │
   ▼
① build-index.mjs（按分层新鲜度判断是否刷新，查询时同步刷新）
   ├─ 岚叔 /api/plugins（evidence 分级）＋
   ├─ awesome-dsh-plugin /plugins.json（中英描述+分类）＋
   ├─ dsh.so /plugins-index.json（1360 插件索引，许可：Free to reuse with attribution）＋
   └─ GitHub dsh-plugin topic（增量 200 + 每日全量 1651）
   └──→ 合并去重 → index.json（含来源、stars、更新、证据级别、中英描述、分类、审计、装法）
   │
   ▼
② search.mjs：BM25 粗筛 → top-30 候选
   │
   ▼
③ SKILL.md 指导 Agent：LLM 语义精排（逐条比对需求意图）→ 挑 3 个
   │
   ▼
④ 候选表给用户：名字｜一句话用途｜stars/活跃｜✅安全标记（证据级别 + 审计结论）
   │
   ▼
⑤ 用户拍板 → 安全安装规范 → install-methods.md → 装后验证
```

### 5.3 分层新鲜度（替代统一 TTL，保证"每次查询都最新"）

物理边界：不可能比源头更新（岚叔 30 分钟巡检、awesome/dsh.so 每日、GitHub 实时但限流 60 次/小时）。

| 数据层 | 新鲜度策略 | 依据 |
|---|---|---|
| curated 源（岚叔/awesome/dsh.so） | TTL 30 分钟，过期即刷新 | 对齐最活跃的岚叔巡检频率；无严格限流 |
| GitHub topic 增量 | TTL 15 分钟，只拉最近更新前 2 页（200 个） | 覆盖新出现/刚更新的插件，避开限流 |
| GitHub topic 全量（1651） | 每日一次（可选 cron；未配置时低峰自动补拉） | 全量分页守住限流预算 |
| 本地 audit（top-3） | 每次查询实时执行 | 仅 3 次请求 |

查询时同步刷新：`search.mjs` 检查各层新鲜度 → 全部新鲜则秒回缓存；任一层过期则同步刷新该层
（curated 30 分钟层几秒完成）→ 用户每次查询拿到的索引 = 当时能拿到的最新状态。

可选增强：README 引导配置 launchd/cron 每小时 `build-index.mjs --refresh`、每日 `--refresh-full`。

## 6. 核心模块

### 6.1 统一索引数据模型（index.json）

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-15T08:00:00Z",
  "sources": { "lanshu": {"ok":true,"count":203}, "awesome": {"ok":true,"count":282},
               "dshso": {"ok":true,"count":1360}, "githubTopic": {"ok":true,"count":1651} },
  "plugins": [{
    "id": "dsh-web-ui",
    "repo": "zhu1090093659/dsh-web-ui",
    "url": "https://github.com/zhu1090093659/dsh-web-ui",
    "description": { "en": "...", "zh": "..." },
    "stars": 1416,
    "pushedAt": "2026-08-10",
    "categories": ["ui-enhancement"],
    "sources": ["lanshu", "awesome", "github"],
    "evidence": { "level": "LISTED", "checkedAt": "..." },
    "audit": { "hasLifecycleScripts": false, "writesOutsideHome": false,
               "modifiesShell": false, "risk": "low" },
    "installHint": "bundle"
  }]
}
```

合并规则：同一 repo 多源收录 → 合并（描述取最全、stars 取最新、evidence 取最严格）；
仅 GitHub topic 收录 → 标记 `evidence: topic-only`。

### 6.2 BM25 检索（search.mjs）

- 中文切分：CJK 字符 bigram（2-gram），零依赖
- 英文：小写 + 空格分词
- 字段权重：name 1.5、description 1.0、categories 0.5、topics 0.5
- 输出：top-30 JSON 交 Agent LLM 精排

### 6.3 安全审计（audit.mjs）

静态检查（不装依赖、不跑代码）：
1. `package.json` 是否有 `preinstall/install/postinstall/prepare`（→ 风险提示）
2. README 是否提及写 `$HOME` 之外路径
3. 是否提及修改 shell 配置（`.bashrc`/`.zshrc`）
4. 合并岚叔 evidence 级别（站点实测有 LISTED/AUTO 两级；其余状态以
   /api/plugins 实际字段为准，实施时核对并映射）

工程约束：GitHub 匿名 API 限流 60 次/小时，不对 top-30 全量审计；
优先消费岚叔已做好的静态检查，本地审计只对用户拍板前的 top-3 候选实时执行。

### 6.4 安装判定与验证

- 判定：`dsh.bundle.patch` → bundle；含 `SKILL.md` → skill；README 写明写 `cordis.patch.yml` → cordis；
  旧格式 → 标「需迁移」
- `install-methods.md`：三套装法 + 安全确认点（lifecycle scripts 时停下确认）
- 装后验证：UI 入口出现或 `dsh --profile web --dump-config` 有插件行

## 7. SKILL.md 指令设计

### 7.1 触发条件（frontmatter description）
```
用户想给 DeepSeek Harness 找插件时使用：「有没有插件能……」「帮我装个 XX」
「生态里有什么好玩的」。语义检索四源聚合 + 安全审计 + 安装验证。
只负责找和装；开发新插件不归本 skill 管。
```

### 7.2 五步流程
```
Step 1  运行 scripts/search.mjs "<需求描述>"（脚本内部自动处理索引新鲜度/刷新）
Step 2  对 top-30 候选做 LLM 语义精排：逐条比对需求意图；
        优先级：语义匹配 > evidence 级别 > stars > 最近更新；同功能中文插件优先
Step 3  挑 3 个输出候选表（固定格式）
Step 4  等用户拍板；用户点名某插件时直接校验后进入 Step 5
Step 5  按 references/install-methods.md 安装 → 验证挂载 → 汇报结果
```

### 7.3 安全安装规范（硬性规则，不可跳过）
- 候选表中 `audit.risk=high` 或 evidence 为拦截/拒绝级（以岚叔 API 字段为准）：推荐时必须标注风险
- 安装前若插件有 lifecycle scripts 或审计发现写 $HOME 外路径：停下，展示原文风险说明，
  用户明确确认才继续
- 安装只允许 `dsh plugin --profile <当前profile> add <包名/源>`
- 装完必须验证；验证失败要排查并如实报告

### 7.4 候选表输出格式
```
候选 1：<插件名>  ★<stars>  <证据级别> <风险标记>
  一句话用途：……
  为什么匹配：<1 句语义理由>
  安装：dsh plugin --profile web add <包名>
候选 2：……（最多 3 个）
```

### 7.5 降级策略
| 异常 | 处理 |
|---|---|
| 四源全挂 | 用旧索引 + 明确告知"数据源异常，索引可能过期" |
| 单源失败 | 其余源照常，索引标记该源缺失 |
| 无候选匹配 | 直说没找到，建议换关键词/转 make-dsh-plugin 现写 |
| 用户点名插件已下架/不可装 | 说明原因，给最接近的替代候选 |
| GitHub 限流 | 用缓存索引 + 提示"GitHub 增量刷新暂不可用" |

## 8. README 设计（社区门面）

1. 标题 + 一句话定位（语义检索 × 四源聚合 × 安全审计）
2. **与别人的差异**（对比表置顶）：检索方式/数据源/安全审计/形态/更新机制，对照
   dsh-find-plugins、dsh-find-plugin、dsh-plugin-finder
3. 快速开始（3 步：复制目录 → 新会话 → 对话提问）
4. 使用示例（对话演示 + 候选表样式）
5. 工作原理（数据流图）
6. **数据源与更新机制**：四源清单 + TTL/定时配置（launchd/cron 示例）
7. **数据源与致谢**（合规 + 感谢）：

| 数据源 | 链接 | 说明 |
|---|---|---|
| 岚叔 DSH 插件资源站 | https://dsh.lanshuagent.com | 30 分钟自动巡检，evidence 证据分级 |
| awesome-dsh-plugin | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin | 社区精选目录，中英双语描述 |
| dsh.so | https://www.dsh.so | DeepSeek Harness 开发者中心，1360 插件索引，开放数据许可 |
| GitHub dsh-plugin topic | https://github.com/topics/dsh-plugin | 生态全量 1651 仓库 |

特别致谢：dsh.so 开放数据许可（Free to reuse with attribution）、岚叔站点的 evidence
分级体系、awesome-dsh-plugin 社区维护者。数据版权归各源所有，本插件仅做聚合与检索。

8. 安全模型（evidence 分级解释 + 静态审计检查项 + 免责声明）
9. 开发与贡献（测试、构建、PR）
10. LICENSE（BSD-3-Clause）

## 9. 工程与发布

- 测试：3 组单测（bm25/merge/audit），fixture 数据，不依赖真实网络
- 发布：JazzuLu 账号 `gh repo create find-dsh-plugins`（public）→ push → 打 `dsh-plugin` topic
- 收录申请：awesome-dsh-plugin 收录流程 → 进入 dsh-market；尝试 dsh.so 与岚叔站点
- 安装引导：复制 `find-dsh-plugins/` 到 `~/.dsh/skills/`（与现装 find-plugins 并存不冲突）

## 10. 成功标准

1. 用户对话提问 → 3 个候选含语义理由 + 安全标记，≤ 几秒返回
2. 同一需求在不同时间查询，能反映源头最新状态（分层新鲜度生效）
3. 安装高风险插件时流程强制停下确认
4. README 可独立支撑社区用户安装与理解差异化
5. 全套测试通过，无外部依赖（纯 Node 内置模块）
