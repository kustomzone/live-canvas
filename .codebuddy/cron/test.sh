#!/bin/zsh
# ============================================================================
# hot-canvas-to-social 业务脚本(纯逻辑)。
# 运行环境由通用 wrapper.sh 准备好(source ~/.zshrc / PATH 加固 / 清 ANTHROPIC_*):
#   · PATH 含 node / 标准系统目录(date、ioreg 等可用)
#   · 登录环境变量(CODEBUDDY_API_KEY、SMTP_* 等)已就绪
#   · 指向 deepseek 的 ANTHROPIC_* 覆盖已清除
# 因此这里不做任何环境探测/修补。cron 经 wrapper 调用;交互终端可直接跑(需环境正常)。
#
# 职责:到期自删 crontab、跑 codebuddy 完成 hot-canvas-to-social 全流程、写日志。
# ============================================================================
set -u

echo "PATH=$PATH"
echo "SHELL=$SHELL"
env
# 路径自推导
SCRIPT_DIR="${0:A:h}"                 # .../.codebuddy/cron
PROJECT_DIR="${SCRIPT_DIR:h:h}"       # 上两级 = 项目根
CODEBUDDY="$(command -v codebuddy || echo /Users/cuttleyu/.nvm/versions/node/v24.16.0/bin/codebuddy)"
NODE_BIN="$(command -v node || echo /Users/cuttleyu/.nvm/versions/node/v24.16.0/bin/node)"

