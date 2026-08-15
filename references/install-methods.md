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
