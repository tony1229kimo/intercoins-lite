/**
 * Everything under public/ is served to the browser, so anything written there
 * is readable by any guest who opens devtools. Guests did, and reported the
 * campaign as looking fraudulent.
 *
 * What they could actually read on 2026-09-04:
 *   - a hardcoded list of sample winners with names and prizes that were not
 *     even part of this campaign, next to a comment calling it a sample list
 *   - "best-guess URLs, marketing to verify before launch" on the live task
 *     links
 *   - a note explaining that repeating a claim link would let a guest claim
 *     without limit
 *   - "AI draft, needs legal review" and "tax threshold unverified", as visible
 *     page text rather than comments
 *
 * Three layers now stand between that class of mistake and a guest:
 *   1. this file, which bans the phrasing outright
 *   2. an English-only rule for comments in public/, so nothing intended for us
 *      is casually readable by a Chinese-reading guest
 *   3. server/index.js, which strips every comment on the way out, so the
 *      source keeps its documentation and the browser receives none of it
 *
 * Layer 3 is the one that actually protects guests. Layers 1 and 2 exist
 * because a stripper can be bypassed by serving a file some other way, and
 * because reviewing this by hand has already failed more than once.
 *
 * admin.html is held to the same standard for identifiers, but "probability",
 * "quota" and voucher wording are its legitimate UI labels, so it is exempt
 * from the guest-facing rules.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { commentSpans, stripComments, HAS_CJK } from "../lib/htmlComments.js";

const PUBLIC_DIR = path.join(import.meta.dirname, "..", "..", "public");
const FILES = readdirSync(PUBLIC_DIR).filter((f) => f.endsWith(".html"));
const read = (f) => readFileSync(path.join(PUBLIC_DIR, f), "utf8");

/** Banned in every file we serve. */
const BANNED_ALL = [
  ["hardcoded password", /(?:PASSWORD|password)\s*[:=]\s*['"][^'"]{3,}['"]/,
   "passwords come from the server environment, never from a public file"],
  ["hosting provider", /Zeabur/, "do not name the hosting platform in the front end"],
  ["environment variable names",
   /ADMIN_TOKEN|ADMIN_USERS|DATABASE_URL|LINE_MESSAGING_ACCESS_TOKEN|MAX_PHYSICAL_WINS|PRIZES_RESEED|PREVIEW_PASSWORD/,
   "do not name server environment variables in the front end"],
  ["database tables", /player_profiles|prize_contacts|task_claims|coin_ledger|[Pp]ostgres/,
   "do not reveal the database or its tables"],
  ["voucher endpoint", /api\.omnichat|omnichat\.ai/i,
   "voucher links are stateless: whoever holds one can redeem it"],
  ["internal source filename", /\.xlsx/, "do not reveal internal source files"],
  // 2026-09-04: the earlier rule spelled one project name exactly, and the file
  // said it a slightly different way, so it went through. Match loosely.
  ["other project names", /味蕾|culinary-?journey|ictaipei|ickaohsiung|wellness-ai/i,
   "do not mention other projects"],
  ["backend file paths", /server\/(lib|routes|middleware)\//,
   "do not reveal the backend source layout"],
  ["internal incident references", /POSTMORTEM|Bug #\d/i,
   "do not carry incident references into a file guests can read"],
];

/** Additionally banned in index.html, which guests open. */
const BANNED_CUSTOMER = [
  ["unreviewed-copy admission",
   /AI 草稿|需法務|待查證|恐受限|尚未審核|未定案|草稿/,
   "never admit the copy is unreviewed: it tells guests the terms may not hold"],
  ["weak-protection admission",
   /假驗證|無法真的驗證|回來即發|輕量存取門檻|保護應改由|原型/,
   "never write that a check is fake or that protection is inadequate"],
  ["admin endpoints", /\/api\/admin/, "the front end must not name admin endpoints"],
  ["how the odds are hidden",
   /機率.{0,8}庫存|庫存.{0,8}機率|不能讓客人|改個變數|自己改幣數/,
   "do not explain what is hidden, or why"],
  ["commercial intent",
   /刻意不列|留在畫面上當目標|免得客人白轉|當誘因|維持蒐集動機|升級誘導|提升可信度/,
   "do not write down how the page is meant to steer guests"],
  // Odds: only inside a probability context, so CSS width:100% and the lawful
  // 10%/20% withholding rates in the terms are not false positives.
  ["win probability figures",
   /(?:機率|中獎率|weight|odds|probability)[^\n]{0,20}\d{1,3}(?:\.\d+)?\s*%|\d{1,3}(?:\.\d+)?\s*%[^\n]{0,12}(?:機率|中獎率)/i,
   "win probabilities are never public"],
  ["sample or placeholder winners",
   /DEMO_WINNERS|示意名單|最佳猜測|偽造|虛構/,
   "no invented winners, and no admission that anything on the page is invented"],
  ["exploit notes", /無限領|單次有效/,
   "do not describe how the claim links could be abused"],
];

for (const file of FILES) {
  const src = read(file);
  const rules = file === "index.html" ? [...BANNED_ALL, ...BANNED_CUSTOMER] : BANNED_ALL;

  for (const [label, re, why] of rules) {
    test(`${file} must not contain: ${label}`, () => {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      const hits = (src.match(g) || []).map((h) => h.replace(/\s+/g, " ").slice(0, 60));
      assert.deepEqual(hits, [], `${why}\nfound ${hits.length}: ${JSON.stringify(hits.slice(0, 5))}`);
    });
  }

  test(`${file} comments are English only`, () => {
    const bad = commentSpans(src)
      .filter((s) => HAS_CJK.test(s.text))
      .map((s) => `L${src.slice(0, s.start).split("\n").length}: ${s.text.replace(/\s+/g, " ").slice(0, 60)}`);
    assert.deepEqual(bad, [],
      `Comments in public/ stay in English. Guest-facing copy is Chinese, comments are not.\n${bad.join("\n")}`);
  });

  test(`${file} has no comments left after stripping`, () => {
    const left = commentSpans(stripComments(src));
    assert.equal(left.length, 0,
      `the stripper missed ${left.length} comment(s), so they would reach the browser`);
  });
}

test("the stripper only removes comments", () => {
  for (const file of FILES) {
    const src = read(file);
    const code = (s) => stripComments(s).split(/\s+/).join(" ").trim();
    // Stripping an already stripped file must be a no-op, and must not disturb
    // the code: a tokenizer bug would show up here as a changed body.
    assert.equal(code(stripComments(src)), code(src), `${file}: stripping is not idempotent`);
    assert.ok(!stripComments(src).includes("<!--"), `${file}: an HTML comment survived`);
  }
});

test("scanning actually found the files (so this file cannot pass by doing nothing)", () => {
  assert.ok(FILES.includes("index.html"), `index.html not scanned, only: ${FILES}`);
  assert.ok(FILES.includes("admin-login.html"), `admin-login.html not scanned, only: ${FILES}`);
  assert.ok(FILES.length >= 3, `only ${FILES.length} file(s) scanned`);
});
