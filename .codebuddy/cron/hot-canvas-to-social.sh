#!/bin/zsh
# ============================================================================
# hot-canvas-to-social 业务脚本(纯逻辑)。
# 运行环境由通用 wrapper.sh 准备好(source ~/.zshrc / PATH 加固 / 清 ANTHROPIC_*):
#   · PATH 含 node / 标准系统目录(date、ioreg 等可用)
#   · 登录环境变量(CODEBUDDY_API_KEY、SMTP_* 等)已就绪
#   · 指向 deepseek 的 ANTHROPIC_* 覆盖已清除
# 因此这里不做任何环境探测/修补。cron 经 wrapper 调用;交互终端可直接跑(需环境正常)。
#
# 日志:wrapper 已把全部 stdout/stderr 逐行加时间戳后 tee 到按天日志,本脚本只管 echo,
#       既不自己 tee 写文件,也不自己加时间前缀(避免重复)。
#
# 职责:到期自删 crontab、跑 codebuddy 完成 hot-canvas-to-social 全流程。
# ============================================================================
set -u

# 路径自推导
SCRIPT_DIR="${0:A:h}"                 # .../.codebuddy/cron
PROJECT_DIR="${SCRIPT_DIR:h:h}"       # 上两级 = 项目根
CODEBUDDY="$(command -v codebuddy || echo /Users/cuttleyu/.nvm/versions/node/v24.16.0/bin/codebuddy)"
NODE_BIN="$(command -v node || echo /Users/cuttleyu/.nvm/versions/node/v24.16.0/bin/node)"

# ===== 配置 =====
EXPIRE_DATE="2026-12-02"   # 此日期(含)之后不再运行,并自删 crontab 条目
MARKER="# cron-job:hot-canvas-to-social"   # 与 install.sh/kill.sh 的 job 名一致,用于过期自删

# 本次定时任务统一用的模型(仅作用于本脚本进程及其所有子进程,不改全局设置)。
RUN_MODEL="claude-opus-4.8-1m"
# flipbook server 生成画册时 spawn 的子 codebuddy 不带 --model,会回退到 CODEBUDDY_MODEL。
# 导出它 → server(build_canvases.mjs 传 ...process.env)→ 其 codebuddy 子进程全部用它。
export CODEBUDDY_MODEL="$RUN_MODEL"

# ===== 过期自删 =====
# 字符串比较即可(YYYY-MM-DD 字典序 == 时间序)
TODAY_CMP="$(date +%Y-%m-%d 2>/dev/null)"
if [[ -n "$TODAY_CMP" && ( "$TODAY_CMP" > "$EXPIRE_DATE" || "$TODAY_CMP" == "$EXPIRE_DATE" ) ]]; then
  echo "reached expire date ${EXPIRE_DATE}, removing crontab entry and exiting."
  # 删掉带 MARKER 的两行(注释行 + 命令行)
  crontab -l 2>/dev/null | grep -v -F "$MARKER" | crontab -
  exit 0
fi

# ===== 执行 skill =====
echo "start hot-canvas-to-social"
cd "$PROJECT_DIR" || { echo "cd failed"; exit 1; }

PROMPT='/goal 完成 hot-canvas-to-social 全流程：当日热点选题→批量生成竖版画册→导出→文案润色→多 tab 填充(抖音)全部停在发布前，且已按要求发出进度/汇报邮件；任一步骤失败也要先发出错误汇报邮件再结束。

执行 hot-canvas-to-social skill:联网搜当日网络热点,批量生成竖版 flipbook 画册(canvas),再基于产出的画册进入 canvas-to-social 完成导出+文案润色+多 tab 填充(发布目标:抖音),严格遵守铁律:绝不点最终发布按钮,所有 tab 填好内容后停在发布前,把发布权留给用户。

进度邮件要求(用 send-email skill,收件人 imcuttle@163.com,全程总共不超过 2 封):
1. 选题+建册+导出+文案润色完成后，发第 1 封:本次选了哪些主题、文案、生成了几个画册(canvasId)，每个画册图片数量，节点内容，每个画册的封面图。
3. 全部 tab 填好、停在发布前发第 2 封(最终汇报):每条 canvasId/主题/标题/图片数/合集/tab 状态,并强调没有任何一条被自动发布、发布权在用户手里。
若中途失败,把已用的邮件额度内发一封错误汇报，以及完成的汇报。'

# 流式输出:stream-json 逐行实时产出,经 format-stream.mjs 转成人读文本。
# stdout/stderr 由 wrapper 统一逐行加时间戳并 tee 到日志,这里只管 echo。
# 编排进程用 RUN_MODEL;CODEBUDDY_MODEL 已 export,flipbook 建册的子 codebuddy 同样用它。
"$CODEBUDDY" -p -y \
  --model "$RUN_MODEL" \
  --output-format stream-json \
  "$PROMPT" 2>&1 | "$NODE_BIN" "${SCRIPT_DIR}/format-stream.mjs"
RUN_EXIT="${pipestatus[1]}"   # codebuddy(管道第 1 段,zsh 的 pipestatus 是 1-based)的退出码,须紧跟管道捕获

echo "done hot-canvas-to-social (exit ${RUN_EXIT})"
