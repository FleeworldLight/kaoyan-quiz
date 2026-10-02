import React, { useMemo } from "react";
import katex from "katex";
import { cn } from "../lib/utils.js";

const DATA_BASE = (import.meta.env.BASE_URL || "./").replace(/\/$/, "") + "/data/";

function renderMath(tex, display) {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      errorColor: "#c33a32",
      strict: false,
      trust: false,
      output: "html",
    });
  } catch {
    return null;
  }
}

const TOKEN_RE = /(\$\$[\s\S]+?\$\$)|(\$[^$\n]+?\$)|(!\[[^\]]*\]\([^)]+\))|(\*\*[^*\n]+\*\*)/g;

function textNodes(s, keyPrefix) {
  const nodes = [];
  const lines = s.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) nodes.push(<br key={keyPrefix + "-br-" + i} />);
    if (!line) return;
    const pieces = line.split(/(\*\*[^*]+\*\*)/g);
    pieces.forEach((pc, j) => {
      const m = pc.match(/^\*\*([^*]+)\*\*$/);
      if (m) nodes.push(<strong key={keyPrefix + "-b-" + i + "-" + j}>{m[1]}</strong>);
      else if (pc) nodes.push(<React.Fragment key={keyPrefix + "-t-" + i + "-" + j}>{pc}</React.Fragment>);
    });
  });
  return nodes;
}

/** 轻量 Markdown + LaTeX 渲染：$$..$$、$..$、![](images/x)、**粗体**、换行 */
export default function RichText({ text, subject, inline = false, className, clamp }) {
  const nodes = useMemo(() => {
    const src = String(text ?? "");
    if (!src) return null;
    const out = [];
    let last = 0;
    let m;
    let k = 0;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(src)) !== null) {
      if (m.index > last) out.push(...textNodes(src.slice(last, m.index), "p" + k));
      const tok = m[0];
      if (tok.startsWith("$$")) {
        const html = renderMath(tok.slice(2, -2), true);
        out.push(
          html
            ? <div key={"m" + k} className="my-1 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
            : <code key={"m" + k} className="math-error">{tok}</code>
        );
      } else if (tok.startsWith("$")) {
        const html = renderMath(tok.slice(1, -1), false);
        out.push(
          html ? <span key={"m" + k} dangerouslySetInnerHTML={{ __html: html }} />
               : <code key={"m" + k} className="math-error">{tok}</code>
        );
      } else if (tok.startsWith("![")) {
        const url = tok.replace(/^!\[[^\]]*\]\(/, "").replace(/\)$/, "").trim();
        const src2 = /^https?:/.test(url) ? url : DATA_BASE + (subject ? subject + "/" : "") + url.replace(/^\.?\//, "");
        out.push(<img key={"i" + k} className="q-figure" src={src2} alt="" loading="lazy" />);
      }
      last = m.index + tok.length;
      k++;
    }
    if (last < src.length) out.push(...textNodes(src.slice(last), "p" + k));
    return out;
  }, [text, subject]);

  if (inline) return <span className={className}>{nodes}</span>;
  return <div className={cn("prose-q", clamp && "line-clamp-3", className)}>{nodes}</div>;
}
