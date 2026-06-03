#!/bin/zsh
# ============================================================================
# 通用 cron 环境 wrapper —— 把 cron 的极简环境补齐,再执行真实业务脚本。
#
# 用法:  wrapper.sh <真实脚本> [args...]
#   <真实脚本>: 业务脚本路径。绝对路径直接用;相对路径按本 wrapper 所在目录解析。
#
# 为什么需要这层:cron 启动的是非交互、非登录 shell,环境极简——
#   · 不读任何 rc 文件(没有 nvm / CODEBUDDY_API_KEY / SMTP_* 等)
#   · base PATH 通常只有 /usr/bin:/bin(缺 /usr/sbin → ioreg 之类找不到)
#   · 残留指向 deepseek 的 ANTHROPIC_* 会劫持 codebuddy 后端
# 所有"为对抗 cron 环境"的处理都集中在这里,业务脚本因此保持纯净。
#
# 日志:本 wrapper 是唯一的日志归口——把自身 + 业务脚本的全部 stdout/stderr 同时
#       写入按天命名的日志并透传到终端。业务脚本因此无需自己 tee(否则会重复写)。
#
# install.sh 会自动把本 wrapper 插到 crontab 命令最前面,业务脚本作为参数传入。
# kill.sh 按业务脚本名定位进程——wrapper 进程的命令行含业务脚本路径,故同样能被匹配到。
# ============================================================================
set -u

SCRIPT_DIR="${0:A:h}"   # .../.codebuddy/cron

# ===== 日志归口(在改 PATH 之前就绪;date/tee 都在 cron base PATH 里)=====
LOG_DIR="${SCRIPT_DIR}/logs"
mkdir -p "$LOG_DIR"
TODAY="$(date +%Y-%m-%d 2>/dev/null)"
# 兜底:date 解析失败时用占位名,避免日志退化成无日期的 .log。
[[ -z "$TODAY" ]] && TODAY="unknown-$(/bin/date +%s 2>/dev/null || echo nodate)"
LOG="${LOG_DIR}/${TODAY}.log"
# 从这里起,本进程及其所有子进程的 stdout/stderr 都经 tee 同时落盘 + 透传终端。
exec > >(tee -a "$LOG") 2>&1

# wrapper 自身日志统一走 log(),每行前置时间戳,与业务脚本日志格式一致。
log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }

log "=== wrapper start (${1:-}) ==="

# # 1) 引入登录环境:复用 ~/.zshrc 里的 nvm 初始化、CODEBUDDY_API_KEY、SMTP_* 等。
# #    宽容处理:rc 里的交互式逻辑在非交互下可能报错,不让它中断本脚本。
# [[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc" 2>/dev/null || true

# # 2) PATH 加固:无论 cron base PATH 多简陋、或 ~/.zshrc 把 PATH 写坏(历史上第 139 行
# #    引号未闭合),都把 node 目录 + 标准系统目录前置,确保 node/date/ioreg 可用。
# NODE_BIN="$(command -v node || echo /Users/cuttleyu/.nvm/versions/node/v24.16.0/bin/node)"
# export PATH="${NODE_BIN:h}:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# # 3) 模型后端决策:清掉 ~/.zshrc 里指向 deepseek 的 ANTHROPIC_* 覆盖,
# #    让业务脚本里的 --model(codebuddy 自有后端)生效。
# unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL ANTHROPIC_SMALL_FAST_MODEL

log "wrapper SHELL=$SHELL"
log "wrapper PATH=$PATH"

# 业务脚本可读取 CRON_LOG 复用同一日志文件(如需自己写早退日志)。
export CRON_LOG="$LOG"

# ===== 解析并执行真实脚本 =====
TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  log "用法: $0 <真实脚本> [args...]" >&2
  exit 1
fi
shift

# 相对路径按 wrapper 所在目录解析
[[ "$TARGET" = /* ]] || TARGET="${SCRIPT_DIR}/${TARGET}"
if [[ ! -x "$TARGET" ]]; then
  log "目标脚本不可执行或不存在: $TARGET" >&2
  exit 1
fi

# 不用 exec:保留 wrapper 作为父进程,kill.sh 才能按业务脚本路径抓到整棵子进程树。
# 业务脚本的 stdout/stderr 合并后逐行前置时间戳,wrapper 自身的日志保持原样。
SHELL_BIN="$(command -v zsh || command -v bash || echo sh)"

# 执行前引入登录环境:按优先级取第一个存在的 rc(~/.zshrc → ~/.bashrc),
# 在运行业务脚本的同一子 shell 内先 source 它(复用 nvm / CODEBUDDY_API_KEY / SMTP_*)。
# rc 在非交互下可能报错,故 2>/dev/null 容错,不让它中断业务脚本。
RC=""
for cand in "$HOME/.zshrc" "$HOME/.bashrc"; do
  [[ -f "$cand" ]] && { RC="$cand"; break; }
done
[[ -n "$RC" ]] && log "sourcing rc: $RC" || log "no rc found, running with bare env"

# 子 shell 内:source rc(可选)后 exec 业务脚本,$@ 原样透传给业务脚本。
"$SHELL_BIN" -c '[[ -n "$1" ]] && source "$1" 2>/dev/null; shift; exec "$0" "$@"' \
  "$TARGET" "$RC" "$@" 2>&1 | while IFS= read -r line; do
  printf '[%s] %s\n' "$(date '+%F %T')" "$line"
done
RUN_EXIT=${pipestatus[1]}

log "=== wrapper done (${TARGET} exit ${RUN_EXIT}) ==="
exit $RUN_EXIT
