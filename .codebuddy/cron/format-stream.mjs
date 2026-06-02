#!/usr/bin/env node
// 把 codebuddy --output-format stream-json 的逐行 JSON 转成人读日志。
// 用法: codebuddy -p -y --output-format stream-json "$PROMPT" | node format-stream.mjs
// 逐行读 stdin、JSON.parse、按事件类型输出带时间戳的纯文本到 stdout。
import { createInterface } from 'node:readline';

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const line = (s) => process.stdout.write(`[${ts()}] ${s}\n`);

// 截断长文本,日志保持可读
const clip = (s, n = 800) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + ` …(+${s.length - n}字)` : s;
};

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const raw of rl) {
  const t = raw.trim();
  if (!t) continue;
  let e;
  try { e = JSON.parse(t); } catch { line(`(原始) ${clip(t)}`); continue; }

  switch (e.type) {
    case 'system':
      if (e.subtype === 'init') line(`▶ 会话启动 model=${e.model} session=${e.session_id}`);
      break;

    case 'assistant': {
      const blocks = e.message?.content ?? [];
      for (const b of blocks) {
        if (b.type === 'text' && b.text?.trim()) {
          line(`💬 ${clip(b.text)}`);
        } else if (b.type === 'tool_use') {
          const arg = b.input ? clip(JSON.stringify(b.input), 300) : '';
          line(`🔧 调用工具 ${b.name} ${arg}`);
        }
      }
      break;
    }

    case 'user': {
      // tool_result 回传
      const blocks = e.message?.content ?? [];
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const c = Array.isArray(b.content)
            ? b.content.map((x) => x.text ?? '').join(' ')
            : b.content;
          line(`   ↳ 结果 ${clip(c, 400)}`);
        }
      }
      break;
    }

    case 'result':
      line(`■ 结束 ${e.is_error ? '失败' : '成功'} turns=${e.num_turns} 用时=${Math.round((e.duration_ms ?? 0) / 1000)}s`);
      if (e.result) line(`最终输出: ${clip(e.result, 2000)}`);
      break;

    default:
      // file-history-snapshot / status 等噪声事件忽略
      break;
  }
}
