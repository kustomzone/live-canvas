#!/bin/zsh
# 每天 11:00 跑 hot-canvas-to-douyin skill,半年后(EXPIRE_DATE)自动从 crontab 摘除自己。
# 由系统 crontab 调用,脱离 CodeBuddy 会话独立运行。

set -u

# ===== 路径自推导(不写死项目目录)=====
# 本脚本位于 <PROJECT_DIR>/.codebuddy/cron/ 下。${0:A:h} = 脚本所在绝对目录。
SCRIPT_DIR="${0:A:h}"                 # .../.codebuddy/cron
PROJECT_DIR="${SCRIPT_DIR:h:h}"       # 上两级 = 项目根
CODEBUDDY="$(command -v codebuddy || echo /Users/cuttleyu/.nvm/versions/node/v24.16.0/bin/codebuddy)"

# ===== 配置 =====
EXPIRE_DATE="2026-12-02"   # 此日期(含)之后不再运行,并自删 crontab 条目
MARKER="# cron-job:hot-canvas"   # 与 install.sh/kill.sh 的 job 名一致,用于自删
LOG_DIR="${SCRIPT_DIR}/logs"

# 本次定时任务统一用的模型(仅作用于本脚本进程及其所有子进程,不改全局设置)。
RUN_MODEL="claude-haiku-4.5"
# flipbook server 生成画册时 spawn 的子 codebuddy 不带 --model,会回退到 CODEBUDDY_MODEL。
# 导出它 → server(build_canvases.mjs 传 ...process.env)→ 其 codebuddy 子进程全部用 haiku。
export CODEBUDDY_MODEL="$RUN_MODEL"

mkdir -p "$LOG_DIR"
TODAY="$(date +%Y-%m-%d)"
LOG="${LOG_DIR}/${TODAY}.log"

# ===== 过期自删 =====
# 字符串比较即可(YYYY-MM-DD 字典序 == 时间序)
if [[ "$TODAY" > "$EXPIRE_DATE" || "$TODAY" == "$EXPIRE_DATE" ]]; then
  echo "[$(date '+%F %T')] reached expire date ${EXPIRE_DATE}, removing crontab entry and exiting." >> "$LOG"
  # 删掉带 MARKER 的两行(注释行 + 命令行)
  crontab -l 2>/dev/null | grep -v -F "$MARKER" | crontab -
  exit 0
fi

# ===== 执行 skill =====
echo "[$(date '+%F %T')] start hot-canvas-to-douyin" >> "$LOG"
cd "$PROJECT_DIR" || { echo "cd failed" >> "$LOG"; exit 1; }

PROMPT='执行 hot-canvas-to-douyin skill:联网搜当日网络热点,批量生成竖版 flipbook 画册(canvas),再基于产出的画册进入 douyin-from-canvas 完成导出+文案润色+多 tab 填充,严格遵守铁律:绝不点最终发布按钮,所有 tab 填好内容后停在发布前,把发布权留给用户。

进度邮件要求(用 send-email skill,收件人 imcuttle@163.com,全程总共不超过 2 封):
1. 选题+建册+导出+文案润色完成后，发第 1 封:本次选了哪些主题、文案、生成了几个画册(canvasId)，每个画册图片数量，节点内容，每个画册的封面图。
3. 全部 tab 填好、停在发布前发第 2 封(最终汇报):每条 canvasId/主题/标题/图片数/合集/tab 状态,并强调没有任何一条被自动发布、发布权在用户手里。
若中途失败,把已用的邮件额度内发一封错误汇报，以及完成的汇报。'

# 流式输出:stream-json 逐行实时产出,经 format-stream.mjs 转成人读文本边跑边写日志。
# 编排进程用 RUN_MODEL;CODEBUDDY_MODEL 已 export,flipbook 建册的子 codebuddy 同样用它。
"$CODEBUDDY" -p -y \
  --model "$RUN_MODEL" \
  --output-format stream-json \
  "$PROMPT" 2>&1 | node "${SCRIPT_DIR}/format-stream.mjs" >> "$LOG" 2>&1

echo "[$(date '+%F %T')] done (exit ${pipestatus[1]:-$?})" >> "$LOG"
