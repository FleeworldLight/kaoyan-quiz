#!/usr/bin/env python3
"""
可选步骤：压缩题库配图（就地替换，文件名不变，因此不需要改任何 JSON 引用）。

背景：tools/attach-cs408-images.mjs 从 rebuild PDF 里抽出的配图是原始光栅图，
      408 那 121 张合计约 30 MB。这些图是原卷扫描件里裁出来的区域块，
      纯白像素中位数 85%（带 JPEG 底噪），69 张严格灰度、43 张近灰、只有 9 张轻微彩色。

判据为什么不用 PSNR：这类图的像素误差几乎全在「近白底噪」上，PSNR 会低得吓人
      （实测中位数 38.6 dB）但肉眼完全看不出。真正该守住的是**墨迹（线条/文字）**。
      所以本脚本用「墨迹掩膜 IoU」当质量门槛：把图二值化（默认阈值 160）后
      比对原图与压缩图的墨迹像素交并比，只有 IoU ≥ --min-iou（默认 0.99）才接受。

策略：依次尝试「PNG 无损重编码 / 灰度化 / 调色板 16…256 色」，
      取**满足 IoU 门槛且体积最小**的那个；若全都不达标，退回无损重编码。

为什么用 Python：Node 侧没有纯 JS 的 PNG 量化实现。这个脚本**不在 npm 流水线里**，
      仓库里提交的图片已经是压缩过的，正常使用不需要跑它。只有当你重新执行
      `pnpm data:cs408` 重新抽图之后，才需要手动跑一次。

依赖：Python 3 + Pillow + numpy

用法：
    python tools/optimize-images.py                 # 压缩全部题库配图
    python tools/optimize-images.py --dry-run       # 只看能省多少，不写盘
    python tools/optimize-images.py --verbose       # 逐张打印选了哪档
    python tools/optimize-images.py --min-iou 0.995 # 更保守（默认 0.99）
    python tools/optimize-images.py --min-kb 20     # 小于该体积的图跳过
"""
import argparse
import io
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data")
SUBDIRS = ["cs408", "math1", "english1", "politics", "mock"]
CANDIDATE_COLORS = [16, 24, 32, 48, 64, 96, 128, 192, 256]


def ink_iou(a, b, thr):
    """两张图的墨迹掩膜交并比（0~1）。尺寸不同直接算 0。"""
    A = np.asarray(a.convert("L"), dtype=np.uint8)
    B = np.asarray(b.convert("L"), dtype=np.uint8)
    if A.shape != B.shape:
        return 0.0
    ma = A < thr
    mb = B < thr
    union = np.count_nonzero(ma | mb)
    if union == 0:
        return 1.0
    return float(np.count_nonzero(ma & mb)) / union


def encode(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def optimize(path, args):
    before = os.path.getsize(path)
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:
        return before, before, "读取失败: %s" % e, 1.0

    rgb = im.convert("RGB")
    tried = []                      # (size, blob, tag, iou)

    def consider(img, tag):
        try:
            blob = encode(img)
        except Exception:
            return
        tried.append((len(blob), blob, tag, ink_iou(rgb, img, args.ink_thr)))

    consider(rgb, "png-opt")
    gray = rgb.convert("L")
    if ink_iou(rgb, gray, args.ink_thr) >= 1.0:
        consider(gray, "gray")
    for c in (CANDIDATE_COLORS if not args.colors else [args.colors]):
        consider(rgb.convert("P", palette=Image.ADAPTIVE, colors=c), "palette-%d" % c)

    if not tried:
        return before, before, "编码失败", 1.0

    ok = [t for t in tried if t[3] >= args.min_iou]
    pool = ok if ok else [min(tried, key=lambda x: x[0])]   # 全不达标则退最小（IoU 会写进报告）
    size, blob, tag, iou = min(pool, key=lambda x: x[0])

    if size >= before:
        return before, before, "已是最优", 1.0
    if not args.dry_run:
        with open(path, "wb") as f:
            f.write(blob)
    return before, size, tag, iou


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--colors", type=int, default=0, help="固定色数；不填则自适应")
    ap.add_argument("--min-iou", type=float, default=0.99)
    ap.add_argument("--ink-thr", type=int, default=160)
    ap.add_argument("--min-kb", type=int, default=20)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    total_before = total_after = 0
    n_ok = n_skip = 0
    worst = []                      # (iou, name)
    for sub in SUBDIRS:
        d = os.path.join(DATA, sub, "images")
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if not name.lower().endswith(".png"):
                continue
            p = os.path.join(d, name)
            before = os.path.getsize(p)
            total_before += before
            if before < args.min_kb * 1024:
                total_after += before
                n_skip += 1
                continue
            b, a, tag, iou = optimize(p, args)
            total_after += a
            worst.append((iou, name))
            if a < b:
                n_ok += 1
                if args.verbose:
                    print("  %-32s %8.0fKB -> %8.0fKB  %-14s IoU %.4f" % (name, b / 1024, a / 1024, tag, iou))
            else:
                n_skip += 1

    worst.sort()
    print()
    print("墨迹一致度最低的 5 张：")
    for iou, name in worst[:5]:
        print("  %-32s IoU %.4f" % (name, iou))
    print()
    print("压缩 %d 张，跳过 %d 张" % (n_ok, n_skip))
    print("合计 %.1f MB -> %.1f MB（省 %.0f%%）%s"
          % (total_before / 1e6, total_after / 1e6,
             (1 - total_after / max(1, total_before)) * 100,
             "  [dry-run，未写盘]" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
