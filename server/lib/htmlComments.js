/**
 * Find and remove comments in an HTML file that inlines its own CSS and JS.
 *
 * Everything under public/ is sent to the browser byte for byte, so any comment
 * written there is read by whoever opens devtools. Guests have done exactly
 * that, and internal notes about how the campaign works do not read well from
 * the outside. So the source keeps its documentation and the browser gets none
 * of it: server/index.js strips comments on the way out.
 *
 * This is a real tokenizer rather than a regex sweep. It tracks strings,
 * template literals (including nested ${}) and regex literals, so the "//" in
 * a URL and a "/*" inside a string are never mistaken for comments.
 */

/** Characters that, immediately before a "/", mean division rather than a regex. */
const DIVIDES = /[A-Za-z0-9_$)\]]/;

/**
 * Every comment in `src`, in source order, as {kind, start, end, text}.
 *
 * Pass mode "js" for a plain .js file; the default walks an HTML document
 * and switches into CSS or JS when it meets a <style> or <script>.
 */
export function commentSpans(src, { mode: startMode = "html" } = {}) {
  const spans = [];
  const lower = src.toLowerCase();
  let i = 0;
  let mode = startMode;
  let prevSig = "";

  // Template literals nest: `a ${ b ? `c` : d } e`. The stack tracks which one
  // we are inside, and whether we are in its text or in a ${...} expression.
  // Expressions are ordinary code and can hold comments, so they must be walked
  // by the main loop rather than skipped over -- a comment written inside one
  // used to be invisible here, which meant it was never stripped either.
  const stack = [];
  const top = () => stack[stack.length - 1];

  const push = (kind, start, end) => spans.push({ kind, start, end, text: src.slice(start, end) });

  while (i < src.length) {
    // Inside the text part of a template literal: no comments, only the ways out.
    if (top()?.k === "tmpl") {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { stack.pop(); prevSig = "`"; i++; continue; }
      if (c === "$" && src[i + 1] === "{") { stack.push({ k: "expr", depth: 1 }); i += 2; continue; }
      i++;
      continue;
    }

    if (mode === "html") {
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i + 4);
        const stop = end === -1 ? src.length : end + 3;
        push("html", i, stop);
        i = stop;
        continue;
      }
      if (lower.startsWith("<style", i)) {
        mode = "css";
        i = src.indexOf(">", i) + 1;
        continue;
      }
      if (lower.startsWith("<script", i)) {
        const gt = src.indexOf(">", i);
        // <script src="..."> has no body of ours to scan.
        mode = /\ssrc\s*=/i.test(src.slice(i, gt)) ? "html" : "js";
        i = gt + 1;
        continue;
      }
      i++;
      continue;
    }

    if (lower.startsWith(mode === "css" ? "</style" : "</script", i)) {
      mode = "html";
      i++;
      continue;
    }

    const c = src[i];

    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      push(mode, i, stop);
      i = stop;
      continue;
    }

    if (mode === "js" && c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      const stop = nl === -1 ? src.length : nl;
      push("js", i, stop);
      i = stop;
      continue;
    }

    if (c === "`") {
      stack.push({ k: "tmpl" });
      prevSig = "`";
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      i = skipString(src, i, c);
      prevSig = c;
      continue;
    }

    // Track the braces of a ${...} so we know which } ends it.
    if (top()?.k === "expr") {
      if (c === "{") top().depth++;
      else if (c === "}") {
        top().depth--;
        if (top().depth === 0) { stack.pop(); prevSig = "}"; i++; continue; }
      }
    }

    if (mode === "js" && c === "/" && !DIVIDES.test(prevSig)) {
      i = skipRegex(src, i);
      prevSig = "/";
      continue;
    }

    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return spans;
}

/** Skip a ' or " string. Template literals are handled by the main loop. */
function skipString(src, i, quote) {
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") { i += 2; continue; }
    if (c === quote) return i + 1;
    if (c === "\n") return i;            // an unterminated quote ends at the line
    i++;
  }
  return i;
}

function skipRegex(src, i) {
  i++;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return i + 1;
    else if (c === "\n") return i;
    i++;
  }
  return i;
}

/**
 * `src` with every comment removed. Line breaks inside a comment are kept.
 *
 * Pass the same mode you would pass commentSpans: "html" (default) for a page
 * that inlines its CSS and JS, "css" or "js" for a standalone file.
 */
export function stripComments(src, opts) {
  let out = src;
  const spans = commentSpans(src, opts);
  for (let n = spans.length - 1; n >= 0; n--) {
    const s = spans[n];
    // Keep a newline where a multi-line comment was, so a "//" comment cannot
    // swallow the code that follows it and line numbers stay comparable.
    out = out.slice(0, s.start) + (s.text.includes("\n") ? "\n" : "") + out.slice(s.end);
  }
  return out;
}

/** CJK ranges, used by the lint that keeps public/ comments in English. */
export const HAS_CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;
