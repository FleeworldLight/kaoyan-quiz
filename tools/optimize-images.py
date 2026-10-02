#!/usr/bin/env python3
"""
可选步骤：压缩题库配图（就地替换，文件名不变，因此不需要改任何 JSON 引用）。

背景：tools/attach-cs408-images.mjs 从 rebuild PDF 里抽出的配图是原始光栅图，
      408 那 121 张合计约 30 MB。这些图基本是线稿/灰阶图表，用自适应调色板
      （256 色）重存成 PNG 后体积约减半，实测 PSNR 48–99 dB，视觉上无差别。

为什么用 Python：Node 侧没有纯 JS 的 PNG 量化实现。这个脚本**不在 npm 流水线里**，
      仓库里提交的图片已经是压缩过的，正常使用不需要跑它。只有当你重新执行
      `pnpm data:cs408` 重新抽图之后，才需要手动跑一次。

依赖：Python 3 + Pillow

用法：
    python tools/optimize-images.py                # 压缩全部题库配图
    python tools/optimize-images.py --dry-run      # 只看能省多少，不写盘
    python tools/optimize-images.py --colors 128   # 指定调色板颜色数（默认 256）
    python tools/optimize-images.py --min-kb 20    # 小于该体积的图跳过（默认 20KB）
"""
import argparse
import io
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data")
SUBDIRS = ["cs408", "math1", "english1", "politics", "mock"]


def targets():
    for sub in SUBDIRS:
        d = os.path.join(DATA, sub, "images")
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.lower().endswith(".png"):
                yield os.path.join(d, name)


def optimize(path, colors, dry_run):
    before = os.path.getsize(path)
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:
        return before, before, "读取失败: %s" % e

    rgb = im.convert("RGB")
    best = None
    # 候选 1：原始（只做 PNG 优化重存）
    for cand_img, tag in ((rgb, "png-opt"), (rgb.convert("P", palette=Image.ADAPTIVE, colors=colors), "palette")):
        buf = io.BytesIO()
        try:
            cand_img.save(buf, "PNG", optimize=True)
        except Exception:
            continue
        n = buf.getbuffer().nbytes
        if best is None or n < best[0]:
            best = (n, buf.getvalue(), tag)

    if best is None:
        return before, before, "编码失败"
    after, blob, tag = best
    if after >= before:
        return before, before, "已是最优"
    if not dry_run:
        with open(path, "wb") as f:
            f.write(blob)
    return before, after, tag


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--colors", type=int, default=256)
    ap.add_argument("--min-kb", type=int, default=20)
    args = ap.parse_args()

    total_before = total_after = 0
    n_ok = n_skip = 0
    for p in targets():
        before = os.path.getsize(p)
        total_before += before
        if before < args.min_kb * 1024:
            total_after += before
            n_skip += 1
            continue
        b, a, tag = optimize(p, args.colors, args.dry_run)
        total_before += 0
        total_after += a
        if a < b:
            n_ok += 1
            print("  %-34s %8.0fKB -> %8.0fKB  (%s)" % (os.path.basename(p), b / 1024, a / 1024, tag))
        else:
            n_skip += 1

    print()
    print("压缩 %d 张，跳过 %d 张" % (n_ok, n_skip))
    print("合计 %.1f MB -> %.1f MB（省 %.0f%%）%s"
          % (total_before / 1e6, total_after / 1e6,
             (1 - total_after / max(1, total_before)) * 100,
             "  [dry-run，未写盘]" if args.dry_run else ""))


if __name__ == "__main__":
    sys.exit(main())
