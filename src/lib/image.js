/**
 * 图片处理管线：把用户拍/贴/拖进来的照片压成适合长期存在本地的两档尺寸。
 *
 * 为什么必须压缩：手机拍一张书页原图 2–4 MB，而本地存储（IndexedDB）虽然配额大，
 * 但浏览器在磁盘紧张时**会主动清理**，攒几百张原图几乎必然出事。
 * 压到长边 2400px 后单张约 300–500 KB，既够看清书上小字，又能存得下几百张。
 *
 * 产出两档：
 *   image  长边 2400 —— 点开放大看细节用
 *   thumb  长边 400  —— 列表缩略图，避免列表一次加载几十张几百 KB 的大图
 *
 * 为什么用 WebP：同样清晰度下比 JPEG 小 25–35%。浏览器不支持时自动退回 JPEG。
 */

export const MAX_EDGE = 2400;   // 大图长边
export const THUMB_EDGE = 400;  // 缩略图长边
const BIG_Q = 0.85;
const THUMB_Q = 0.72;

/** 解码图片；带 EXIF 方向纠正（手机竖拍的照片不纠正会横过来） */
async function decode(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // 某些浏览器不支持 imageOrientation 选项，退回默认
      try { return await createImageBitmap(blob); } catch { /* 继续走下面的兜底 */ }
    }
  }
  // 兜底：<img> + objectURL
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

function fitSize(w, h, maxEdge) {
  const long = Math.max(w, h);
  if (long <= maxEdge) return { w, h };
  const k = maxEdge / long;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** 画到 canvas 并编码；优先 WebP，不支持则 JPEG */
async function encode(canvas, quality) {
  const toBlob = (type) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
  let blob = await toBlob("image/webp");
  if (blob && blob.type === "image/webp") return blob;
  blob = await toBlob("image/jpeg");
  if (blob) return blob;
  throw new Error("浏览器无法编码图片");
}

function drawTo(src, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // 白底：JPEG 不支持透明，带透明的截图会被填黑
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

/**
 * 处理一张用户图片。
 * @param {File|Blob} file
 * @returns {Promise<{image:Blob, thumb:Blob, mime:string, width:number, height:number,
 *                    originalBytes:number, bytes:number}>}
 */
export async function processImage(file) {
  if (!file) throw new Error("没有拿到图片");
  if (file.size === 0) throw new Error("这张图是空的（0 字节）");
  const originalBytes = file.size;

  let src;
  try {
    src = await decode(file);
  } catch {
    throw new Error("浏览器无法解码这张图片。iPhone 的 HEIC 格式常见于此，请用「兼容格式」重新导出，或直接截图后再上传。");
  }

  const sw = src.width || src.naturalWidth;
  const sh = src.height || src.naturalHeight;
  if (!sw || !sh) throw new Error("图片尺寸异常，无法处理");

  const big = fitSize(sw, sh, MAX_EDGE);
  const small = fitSize(sw, sh, THUMB_EDGE);

  const imageBlob = await encode(drawTo(src, big.w, big.h), BIG_Q);
  const thumbBlob = await encode(drawTo(src, small.w, small.h), THUMB_Q);

  if (src.close) { try { src.close(); } catch { /* 忽略 */ } }

  return {
    image: imageBlob,
    thumb: thumbBlob,
    mime: imageBlob.type || "image/webp",
    thumbMime: thumbBlob.type || "image/webp",
    width: big.w,
    height: big.h,
    originalBytes,
    bytes: imageBlob.size + thumbBlob.size,
  };
}

/** 从粘贴事件里取图片文件（截图直接 Ctrl+V 是最快的录入方式） */
export function imageFromClipboard(e) {
  const items = e?.clipboardData?.items;
  if (!items) return null;
  for (const it of items) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

/** 从拖放事件里取第一个图片文件 */
export function imageFromDrop(e) {
  const files = e?.dataTransfer?.files;
  if (!files || !files.length) return null;
  for (const f of files) if (f.type.startsWith("image/")) return f;
  return null;
}

export const fmtBytes = (n) => {
  if (!n) return "0 B";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
};
