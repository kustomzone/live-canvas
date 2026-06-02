---
name: hot-canvas-batch
description: 当需要把网络热点/流量高的内容批量做成 flipbook-skill 画册（canvas）时使用——联网搜当日热点、为每个选题生成根图+10+张下钻图的竖版画册，服务自启自关、近3个月同主题自动去重。触发词：热点画册、批量生成画册、网络热点做画册、build hot canvases、canvas 批量下钻、热搜做成画册。
---

# 热点画册批量生成 (hot-canvas-batch)

## 概述
两阶段，职责分明：
1. **选题（你来做，需联网+人工判断）**：联网搜当日热点，挑 1-3 个流量高的选题，
   为每个选题写一份 `themes.json`——含根图主题 + ≥10 个下钻 label。
2. **建册（脚本全自动）**：`build_canvases.mjs` 自己挑空闲端口启动 flipbook server
   （强制 `ENABLE_CODEBUDDY=1`，用 codebuddy 出图，**不依赖 OpenAI**）→ 逐个建竖版
   画册 → 每册根图 + 10 个 label 下钻 → 写带日期的历史记录 → **无论成功/报错/Ctrl-C
   都 kill 掉 server**。(脚本耗时较长，30min~1h)

## 何时使用
- "收集网络热点做成画册" / "批量生成画册" / "热搜做成 canvas"。
- 用户要一次产出多个画册、每册要够多图（≥10 张下钻）。

## 唯一铁律
**选题阶段必须过滤政治敏感话题**——不碰政治人物、政治制度、政府机构、选举、
地缘冲突等。只选娱乐、科技、体育、游戏、生活、文化等安全热点。这条优先级最高。

## 阶段一 —— 选题，写 themes.json

1. 用 WebSearch 搜当日热点（如票房榜、电竞赛事、AI 动态、热门影视/综艺等），
   抓取**具体事实**（数字、事件、名称），这些会成为下钻 label。
2. 按 `scripts/themes.example.json` 的结构写一份 themes 文件。字段：

```json
[
  {
    "topic": "根图主题（一句话，作画册根图标题）",
    "aliases": ["去重关键词1", "去重关键词2"],
    "branches": 5,
    "drills": ["下钻子图1", "下钻子图2", "...", "下钻子图10"]
  }
]
```

- `topic`：根节点主题，会触发一张全景信息图。
- `aliases`：去重用的近义关键词（脚本归一化后做包含匹配）。写全一点，避免下次
  换个说法又重复生成。
- `drills`：每条是一个**下钻子图的主题 label**。脚本走 `/api/canvas/:id/click/upload`
  的 `label` 覆盖路径——**子图内容由 label 决定，不靠点击坐标语义**（坐标只用来在
  画面上铺开热点锚点，避免引导线重叠）。所以 label 要写成具体、自洽的主题句。
- 至少写 10 条 drills（`DRILL_PER` 默认取前 10 条）。

## 阶段二 —— 跑脚本（单条命令，服务自启自关）

```bash
node ./scripts/build_canvases.mjs --themes /path/to/themes.json
```

脚本会：挑空闲端口 → spawn server → 等就绪 → 去重 → 建册 → 写历史 → kill server。
**不需要你手动起服务，也不需要你记得关。**

### flag / env
| 名称 | 默认 | 说明 |
|------|------|------|
| `--themes <path>` | 必填 | themes JSON 文件路径 |
| `--app-dir <path>` | 自动推断 | flipbook app 根目录；脚本不在 app 内时需指定 |
| `--keep-server` | 关 | 调试用，结束后保留 server 不 kill |
| `PORT` | 自动挑空闲端口 | 指定则用固定端口 |
| `ORIENTATION` | `portrait` | 画册方向，竖版/横版 |
| `RECENT_DAYS` | `90` | 去重时间窗（近 N 天同主题跳过） |
| `DRILL_PER` | `10` | 每册下钻子节点数 |
| `ENABLE_OCR` | `0`（关） | 建册默认关掉 Apple Vision OCR 文字层；设 `1` 重新开启 |
| `ENABLE_AUDIO` | `0`（关） | 建册默认关掉 macOS `say` 旁白音频；设 `1` 重新开启 |
| `DRY_RUN=1` | — | 起服务→打印去重计划→关服务，不建册（用于验证 themes/去重）|

> 注：批量建册默认关闭 OCR 与音频——下游 canvas-to-social 导出不消费文字层/旁白，
> 且二者各自给每张图增加一次额外处理开销。需要时用 `ENABLE_OCR=1` / `ENABLE_AUDIO=1` 开回。

建议先 `DRY_RUN=1` 跑一遍确认选题不会被去重命中，再正式建。

## 去重机制
脚本扫 `<app>/topics-history/*/run.json`，取 `timestamp` 在近 `RECENT_DAYS` 天内的
记录，把每个 canvas 的 `topic`+`aliases` 归一化（去空格/标点/大小写）后与本次选题做
包含匹配，命中则 SKIP。**所以每次换新热点即可，老主题不会被重复生成。**

## 产物
- 画册数据：`<app>/server/data/canvases/<canvasId>/`（manifest / tree.json / nodes / images）。
- 历史记录：`<app>/topics-history/<YYYY-MM-DD_HHMMSS>/run.json`，含
  `{canvasId, topic, aliases, orientation, nodeCount}`。**不存 url**——端口是临时的、
  服务会被关掉，url 没有意义；要看画册时另起服务再访问 `/?c=<canvasId>`。

## 每册图片数与结构
- 根图 1 张（全景信息长卷）+ 10 个一级下钻 = 11 张，每册稳定 ≥10 张。
- 想要更多层级/更多图：建完后对某些一级子节点再 click 下钻一层（depth 2），
  或调大 `DRILL_PER`。

## 常见坑
- **codebuddy planner 偶发 JSON 解析失败** → 个别下钻节点缺图（tree 有节点但 images/
  下无对应 .png）。补救：`POST /api/canvas/:id/nodes/:hash/regenerate`，或对根图再补
  一个 label 下钻。脚本的 settle 阶段会等重试落盘。
- **每个父节点并发上限 4**（server 端 `MAX_PARALLEL_CLICKS_PER_NODE`）。脚本按 ~800ms
  间隔投递、整体串行等待，不会触顶；手动批量 click 时注意别一次性超过 4 个。
- **根图较慢**：planner（联网搜索+规划，≤90s）+ 图片生成（≤180s），根图就绪通常
  1-4 分钟，属正常，不要误判卡死。
- **--app-dir**：脚本默认从自身路径上溯 4 级定位 app 根。若把脚本拷到别处运行，
  必须用 `--app-dir` 指向 flipbook app 根目录（含 `server/src/index.js` 的那层）。
