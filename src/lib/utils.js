import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = String(m).padStart(2, "0");
  const sss = String(ss).padStart(2, "0");
  return h > 0 ? h + ":" + mm + ":" + sss : mm + ":" + sss;
}

export function fmtDuration(sec) {
  if (!sec) return "—";
  const m = Math.round(sec / 60);
  if (m < 1) return Math.max(1, Math.round(sec)) + " 秒";
  if (m < 60) return m + " 分钟";
  return Math.floor(m / 60) + " 小时 " + (m % 60) + " 分";
}

export function fmtDate(ts, withTime = true) {
  const d = new Date(ts);
  const base = (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  if (!withTime) return base;
  return base + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

export function fmtDayKey(d) {
  const x = new Date(d);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}

export function pct(n, digits = 0) {
  if (!isFinite(n)) return "0%";
  return (n * 100).toFixed(digits) + "%";
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function accuracy(right, wrong) {
  const t = (right || 0) + (wrong || 0);
  return t ? (right || 0) / t : 0;
}

/** 掌握度分档：用于配色与文案 */
export function masteryTier(acc, attempts) {
  if (!attempts) return { key: "none", label: "未练", tone: "neutral" };
  if (acc >= 0.9) return { key: "mastered", label: "已掌握", tone: "ok" };
  if (acc >= 0.75) return { key: "good", label: "较熟练", tone: "brand" };
  if (acc >= 0.6) return { key: "fair", label: "待巩固", tone: "warn" };
  return { key: "weak", label: "薄弱", tone: "bad" };
}

export const SUBJECT_TONE = {
  math1: { bg: "#edf3ff", fg: "#244fa8", line: "#c7d8ff" },
  english1: { bg: "#e9f7f1", fg: "#166446", line: "#b6e0cf" },
  politics: { bg: "#fff0ee", fg: "#922b25", line: "#f2c4c0" },
  cs408: { bg: "#fff5e5", fg: "#814700", line: "#f0d8ac" },
};

export const QUALITY_META = {
  high: { label: "质量高", tone: "ok" },
  medium: { label: "个别瑕疵", tone: "warn" },
  low: { label: "OCR 较差", tone: "bad" },
  unverified: { label: "未校验", tone: "neutral" },
};
