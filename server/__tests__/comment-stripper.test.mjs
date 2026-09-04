/**
 * The comment stripper is what guarantees that nothing we write to ourselves in
 * public/ can be read by a guest. That guarantee is only as good as the
 * tokenizer: a comment it fails to find is a comment it fails to remove, and it
 * would go out with the page.
 *
 * The one that actually got through: a comment inside a template literal's
 * ${...}. The old scanner treated everything between ${ and } as opaque string
 * content, so comments written in there were invisible to it -- invisible to
 * the English-only lint as well. Three of them were sitting in server/index.js.
 *
 * The other direction matters just as much. Removing something that is NOT a
 * comment -- the // in a URL, a /* inside a string, a slash in a regex -- would
 * corrupt a live page. So both directions are pinned here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { commentSpans, stripComments } from "../lib/htmlComments.js";

const found = (src, mode = "js") => commentSpans(src, { mode }).length;

test("finds a block comment inside a template expression", () => {
  assert.equal(found("const x = `a ${ /* hidden */ b } c`;"), 1);
});

test("finds a line comment inside a template expression", () => {
  assert.equal(found("const x = `a ${ b // hidden\n } c`;"), 1);
});

test("finds a comment inside a nested template expression", () => {
  assert.equal(found("const x = `a ${ `b ${ /* hidden */ c }` } d`;"), 1);
});

test("template TEXT that merely looks like a comment is left alone", () => {
  assert.equal(found("const x = `see /* not a comment */ here`;"), 0);
  assert.equal(found("const x = `https://example.com/path`;"), 0);
});

test("a URL is not a line comment", () => {
  assert.equal(found("const u = 'https://example.com';"), 0);
  assert.equal(found('const u = "https://example.com"; // real'), 1);
});

test("a regex literal is not a comment, and its slashes are not either", () => {
  assert.equal(found("s.replace(/[/]/g, '');"), 0);
  assert.equal(found("s.replace(/[/]/g, ''); /* real */"), 1);
});

test("division is not the start of a regex", () => {
  assert.equal(found("const r = (a) / b;"), 0);
  assert.equal(found("const r = (a) / b; // real"), 1);
});

test("comment markers inside ordinary strings are left alone", () => {
  assert.equal(found("const s = '/* not a comment */';"), 0);
  assert.equal(found('const s = "// not a comment";'), 0);
});

test("HTML, CSS and JS comments are all found in one page", () => {
  const page = [
    "<!-- html -->",
    "<style>/* css */ .a{color:red}</style>",
    "<script>/* js block */ let a = 1; // js line",
    "</script>",
  ].join("\n");
  assert.equal(found(page, "html"), 4);
});

test("<script src> has no body of ours, so nothing in the tag is scanned", () => {
  const page = '<script src="https://cdn.example.com/x.js"></script><!-- real -->';
  assert.equal(found(page, "html"), 1);
});

test("stripping removes the comment and keeps the code", () => {
  const src = "const x = `a ${ /* hidden */ b } c`; // also hidden\nconst y = 2;";
  const out = stripComments(src, { mode: "js" });
  assert.ok(!out.includes("hidden"), `a comment survived: ${out}`);
  assert.ok(out.includes("const y = 2;"), "code was lost");
  assert.equal(commentSpans(out, { mode: "js" }).length, 0);
});

test("a line comment cannot swallow the line below it", () => {
  const out = stripComments("// gone\nconst kept = 1;", { mode: "js" });
  assert.ok(out.includes("const kept = 1;"), `code was swallowed: ${JSON.stringify(out)}`);
});

test("an unterminated block comment does not run off and eat the file", () => {
  // Malformed input should still leave the tokenizer in a defined state.
  assert.doesNotThrow(() => stripComments("const a = 1; /* never closed", { mode: "js" }));
  assert.doesNotThrow(() => stripComments("const a = `never closed", { mode: "js" }));
});
