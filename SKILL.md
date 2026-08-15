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
