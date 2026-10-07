#!/usr/bin/env python3
"""
把「一张图被 PDF 切成多条」的配图合并回单张。

背景：tools/attach-cs408-images.mjs 是按 PDF 里的图像 XObject 逐个抽图的。
如果源 PDF 把一整幅大图切成了 N 个横向条带（重排版 PDF 常见），
我们就会得到 N 张 4904×426 这样的宽条，然后 N 张都挂到同一道题上。

后果有两个：
  1. 要发 N 个请求。2018 第 44 题的图被切成 11 条、合计 1.5 MB，
     弱网（尤其手机流量访问 github.io）下几乎必然有请求失败 —— 图就显示不全。
  2. 前端用 flex-wrap 逐个渲染会有缝隙，看着不像一张图。

本脚本把这组条带按序号纵向拼接成一张，并适当降采样（默认最宽 2400px，
避免 4904px 这种远超实际需要的尺寸），再改写 JSON 里的引用、删掉原条带。

判定保守，只在「同一页 + 条数 ≥ 3 + 宽度一致（±2px）」时才合并 ——
同一页两张并列的小图（宽度通常不同）不会被误合并。

为什么用 Python：需要图像拼接与降采样，Node 侧没有相应依赖。
这个脚本和 optimize-images.py 一样**不在 npm 流水线里**，
仓库里的图已经处理过；只有重新执行 `pnpm data:cs408` 抽图之后才需要跑。

依赖：Python 3 + Pillow

用法：
    python tools/merge-figure-strips.py --dry-run     # 只看会合并哪些
    python tools/merge-figure-strips.py               # 执行
    python tools/merge-figure-strips.py --max-width 3000
"""
import argparse
import json
import os
import re
import sys
from collections import defaultdict

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data")
NAME_RE = re.compile(r"^(cs408-\d{4}-p\d+)-(\d+)\.png$")


def find_groups(img_dir):
    """返回 [(key, [文件名按序号排序]), ...]，只含需要合并的组。"""
    groups = defaultdict(list)
    for f in sorted(os.listdir(img_dir)):
        m = NAME_RE.match(f)
        if m:
            groups[m.group(1)].append((int(m.group(2)), f))
    out = []
    for key, items in sorted(groups.items()):
        if len(items) < 3:
            continue
        items.sort()
        widths = []
        for _, f in items:
            with Image.open(os.path.join(img_dir, f)) as im:
                widths.append(im.size[0])
        if max(widths) - min(widths) > 2:      # 宽度不一致 → 很可能是并列的多张小图
            continue
        out.append((key, [f for _, f in items]))
    return out


def merge(img_dir, key, files, max_width, dry_run):
    paths = [os.path.join(img_dir, f) for f in files]
    before = sum(os.path.getsize(p) for p in paths)

    ims = []
    for p in paths:
        im = Image.open(p)
        im.load()
        ims.append(im.convert("RGB"))

    max_w = max(im.size[0] for im in ims)
    total_h = sum(im.size[1] for im in ims)

    canvas = Image.new("RGB", (max_w, total_h), (255, 255, 255))
    y = 0
    for im in ims:
        canvas.paste(im, (0, y))          # 左对齐；宽度差 1px 时右边补白
        y += im.size[1]

    # 降采样：这些条带常是 600dpi 全页宽（4904px），远超实际需要
    if max_w > max_width:
        scale = max_width / max_w
        canvas = canvas.resize((max_width, max(1, round(total_h * scale))), Image.LANCZOS)

    out_name = key + "-merged.png"
    out_path = os.path.join(img_dir, out_name)

    if not dry_run:
        # 与 optimize-images.py 一致：自适应调色板，明显更小且肉眼无差别
        best = None
        for colors in (256, 128, 64):
            q = canvas.convert("P", palette=Image.ADAPTIVE, colors=colors)
            import io
            buf = io.BytesIO()
            q.save(buf, "PNG", optimize=True)
            if best is None or buf.getbuffer().nbytes < best[0]:
                best = (buf.getbuffer().nbytes, buf.getvalue())
        with open(out_path, "wb") as fh:
            fh.write(best[1])

    after = os.path.getsize(out_path) if not dry_run else 0
    return out_name, before, after, canvas.size, len(files)


def update_json(strips, out_name, dry_run):
    """把引用这些条带的题目改成引用合并后的单张。"""
    changed = []
    strip_set = set(strips)
    for f in sorted(os.listdir(os.path.join(DATA, "cs408"))):
        if not f.endswith(".json") or f.startswith("_"):
            continue
        p = os.path.join(DATA, "cs408", f)
        doc = json.load(open(p, encoding="utf-8"))
        touched = 0
        for sec in doc.get("sections", []):
            for q in sec.get("questions", []):
                imgs = q.get("images") or []
                if not any(str(i) in strip_set for i in imgs):
                    continue
                rest = [i for i in imgs if str(i) not in strip_set]
                # 合并图插到原来第一条条带的位置，保持顺序稳定
                first = next(idx for idx, i in enumerate(imgs) if str(i) in strip_set)
                others_before = len([i for i in imgs[:first] if str(i) not in strip_set])
                q["images"] = rest[:others_before] + [out_name] + rest[others_before:]
                touched += 1
        if touched:
            changed.append((f, touched))
            if not dry_run:
                json.dump(doc, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-width", type=int, default=2400)
    args = ap.parse_args()

    img_dir = os.path.join(DATA, "cs408", "images")
    groups = find_groups(img_dir)
    if not groups:
        print("没有需要合并的图组。")
        return 0

    total_before = total_after = 0
    for key, files in groups:
        out_name, before, after, size, n = merge(img_dir, key, files, args.max_width, args.dry_run)
        changed = update_json(set(files), out_name, args.dry_run)
        total_before += before
        total_after += after
        print(f"{key}: {n} 条 -> {out_name}")
        print(f"    {before/1024:.0f} KB -> {after/1024:.0f} KB  尺寸 {size[0]}x{size[1]}"
              f"{'  [dry-run]' if args.dry_run else ''}")
        for f, c in changed:
            print(f"    更新 {f} 中 {c} 道题的引用")
        if not args.dry_run:
            for f in files:
                os.remove(os.path.join(img_dir, f))
            print(f"    已删除 {n} 个条带文件")

    if not args.dry_run:
        print(f"\n合计 {total_before/1024:.0f} KB -> {total_after/1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
