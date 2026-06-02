#!/usr/bin/env python3
"""
把一个 flipbook 画册导出为社交平台图文素材包（平台无关）。

从 flipbook-skill 数据存储读取画册，生成一个文件夹，内含：
  - images/   : 节点 PNG，按 BFS（根节点优先）顺序重命名为 "NN-标题.png"
  - 文案.md    : 主帖正文（根节点图说 + 话题标签）+ 逐图说明
  - manifest.json : 序号 -> 节点hash / 标题 / 图片 / 文案 的索引

导出包与具体平台无关，可复用于抖音等任意目标平台；发布阶段按平台分流。

用法:
  export_canvas.py CANVAS_ID
  export_canvas.py CANVAS_ID --data-root /path/to/server/data --out /path/to/out
  export_canvas.py CANVAS_ID --limit 35      # 只保留前 N 个节点（抖音上限 35）
  export_canvas.py CANVAS_ID --hashtags "#a #b"

默认值:
  --data-root : $FLIPBOOK_DATA_ROOT 或 ./server/data（相对当前工作目录）
  --out       : <app根>/social-export/<主题>（即 <data-root>/../../social-export）

本脚本刻意不依赖第三方库（仅标准库），可在任意环境运行。
"""
import argparse, json, os, re, shutil, sys


def load_json(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def bfs_order(tree):
    """按根节点优先的广度优先顺序返回节点 hash 列表。"""
    nodes = tree["nodes"]
    root = tree["root"]
    order, queue, seen = [], [root], set()
    while queue:
        h = queue.pop(0)
        if h in seen or h not in nodes:
            continue
        seen.add(h)
        order.append(h)
        queue.extend(nodes[h].get("children", []) or [])
    # 把无法从根节点到达的孤立节点也按文件顺序补上
    for h in nodes:
        if h not in seen:
            order.append(h)
    return order


def clean(text):
    """去掉 markdown 加粗标记，保留内容。"""
    return (text or "").replace("**", "").strip()


def safe_name(s, maxlen=30):
    s = re.sub(r'[\\/:*?"<>|·\n\t]', "", s or "")
    return s.strip()[:maxlen] or "untitled"


def main(argv=None):
    ap = argparse.ArgumentParser(description="把 flipbook 画册导出为社交平台图文素材包")
    ap.add_argument("canvas_id")
    ap.add_argument("--data-root", default=os.environ.get("FLIPBOOK_DATA_ROOT", "server/data"))
    ap.add_argument("--out", default=None)
    ap.add_argument("--limit", type=int, default=0, help="只保留前 N 个节点（0 = 全部）")
    ap.add_argument("--hashtags", default="", help="空格分隔的话题标签，追加到主帖正文末尾")
    args = ap.parse_args(argv)

    canvas_dir = os.path.join(args.data_root, "canvases", args.canvas_id)
    tree_path = os.path.join(canvas_dir, "data", "tree.json")
    if not os.path.isfile(tree_path):
        sys.exit(f"错误：未找到 tree.json：{tree_path}\n"
                 f"请检查 --data-root（当前为 '{args.data_root}'）和 canvas_id。")

    tree = load_json(tree_path)
    topic = tree.get("topic") or args.canvas_id
    nodes_meta = tree["nodes"]
    order = bfs_order(tree)
    if args.limit and args.limit > 0:
        order = order[:args.limit]

    # Default output lives at the APP ROOT's social-export/, not under server/.
    # data-root is conventionally "<app>/server/data", so the app root is two
    # levels up ("server/data" -> "server" -> "<app>"). Using a single ".."
    # would wrongly nest the export under server/.
    out_dir = args.out or os.path.join(args.data_root, "..", "..", "social-export", safe_name(topic, 60))
    out_dir = os.path.abspath(out_dir)
    img_out = os.path.join(out_dir, "images")
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(img_out)

    def node_path(h):
        return os.path.join(canvas_dir, "data", "nodes", f"{h}.json")

    root_node = load_json(node_path(tree["root"])) if os.path.isfile(node_path(tree["root"])) else {}
    root_caption = clean(root_node.get("caption"))

    lines = [f"# 社交图文文案 · {topic}\n",
             f"> 共 {len(order)} 张（抖音图文单条上限 35 张，超出请用 --limit 35 或手动取舍）。\n",
             "\n## ① 主帖正文（复制到发布框）\n", "```", topic, "", root_caption, ""]
    if args.hashtags.strip():
        lines.append(args.hashtags.strip())
    lines += ["```", "\n## ② 逐图说明（每段对应一张图）\n"]

    items = []
    missing = 0
    for i, h in enumerate(order, 1):
        n = load_json(node_path(h)) if os.path.isfile(node_path(h)) else {}
        title = clean(n.get("title") or nodes_meta.get(h, {}).get("title") or h)
        caption = clean(n.get("caption"))
        depth = nodes_meta.get(h, {}).get("depth", 0)
        idx = f"{i:02d}"
        src = os.path.join(canvas_dir, "images", f"{h}.png")
        fname = f"{idx}-{safe_name(title)}.png"
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(img_out, fname))
        else:
            fname = "(缺图)"
            missing += 1
        indent = "　" * depth
        lines.append(f"\n**{idx}. {indent}{title}**")
        if caption:
            lines.append(f"\n{caption}\n")
        items.append({"idx": idx, "hash": h, "title": title,
                      "depth": depth, "image": fname, "caption": caption})

    with open(os.path.join(out_dir, "文案.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"canvas_id": args.canvas_id, "topic": topic,
                   "count": len(order), "missing_images": missing,
                   "items": items}, f, ensure_ascii=False, indent=2)

    print(f"OK -> {out_dir}")
    print(f"  主题: {topic}")
    print(f"  节点: {len(order)}  已复制图片: {len(order)-missing}  缺图: {missing}")
    if len(order) > 35:
        print("  注意：节点超过 35 个；抖音单条图文上限 35 张。")
    # 供调用方解析的机器可读末行
    print(f"OUT_DIR={out_dir}")


if __name__ == "__main__":
    main()
