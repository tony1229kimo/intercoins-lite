/**
 * The admin panel HTML used to be public.
 *
 * The sign-in form kept people out of the data, but not out of the source: the
 * whole panel -- its layout, its field names and every endpoint it calls -- was
 * one GET away for anyone. Now the page itself is behind a session.
 *
 * The rule that makes this safe to add: the cookie releases the HTML and
 * nothing else. Data still requires a bearer token on every /api/admin/* call,
 * so a cookie riding along on a cross-site request can fetch a page and can
 * never read or change anything. These tests pin that split down.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_COOKIE, adminPageAllowed, adminFromRequest, tokenFor,
} from "../middleware/adminAuth.js";

const USER = "gatetest";
const PASS = "correct-horse";
const TOKEN = tokenFor(USER, PASS);

process.env.ADMIN_USERS = `${USER}:${PASS}`;
delete process.env.ADMIN_TOKEN;

/** Minimal stand-in for the bits of an Express request these functions read. */
function req({ cookie = "", authorization = "", query = {} } = {}) {
  const headers = { cookie };
  if (authorization) headers.authorization = authorization;
  return { headers, query, header: (n) => headers[n.toLowerCase()] };
}

test("no cookie means no admin page", () => {
  assert.equal(adminPageAllowed(req()), false);
});

test("a wrong cookie means no admin page", () => {
  assert.equal(adminPageAllowed(req({ cookie: `${ADMIN_COOKIE}=not-the-token` })), false);
});

test("a valid session cookie releases the admin page", () => {
  assert.equal(adminPageAllowed(req({ cookie: `${ADMIN_COOKIE}=${TOKEN}` })), true);
});

test("the cookie is found alongside other cookies", () => {
  const cookie = `_ga=GA1.1.9; ${ADMIN_COOKIE}=${TOKEN}; other=x`;
  assert.equal(adminPageAllowed(req({ cookie })), true);
});

test("the master token also releases the page", () => {
  process.env.ADMIN_TOKEN = "master-key-for-curl";
  try {
    assert.equal(adminPageAllowed(req({ cookie: `${ADMIN_COOKIE}=master-key-for-curl` })), true);
  } finally {
    delete process.env.ADMIN_TOKEN;
  }
});

/* The half that matters: the cookie must buy nothing but the page. */

test("the page cookie does NOT authenticate an API call", () => {
  const r = req({ cookie: `${ADMIN_COOKIE}=${TOKEN}` });
  assert.equal(adminFromRequest(r), null,
    "a cookie must never authorise /api/admin/*, or the panel would be open to cross-site requests");
});

test("the API still accepts a bearer token", () => {
  const who = adminFromRequest(req({ authorization: `Bearer ${TOKEN}` }));
  assert.equal(who?.username, USER);
});

test("a wrong bearer token is rejected", () => {
  assert.equal(adminFromRequest(req({ authorization: "Bearer nope" })), null);
});

test("a truncated token is rejected rather than matching a prefix", () => {
  const short = TOKEN.slice(0, 20);
  assert.equal(adminPageAllowed(req({ cookie: `${ADMIN_COOKIE}=${short}` })), false);
  assert.equal(adminFromRequest(req({ authorization: `Bearer ${short}` })), null);
});

/**
 * /api/health?deep=1 has no other protection and reports live stock, how much
 * has gone and how many people have played -- operational detail that was
 * readable by anyone with curl. Booting the whole app in a test would mean
 * standing up the database, so this checks the guard is still in the source.
 */
test("the deep health check is behind the admin token", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const src = readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");
  const branch = src.slice(src.indexOf("if (req.query.deep)"));
  const guard = branch.indexOf("adminFromRequest");
  const firstQuery = branch.indexOf("prize_pool");
  assert.ok(guard > -1, "the deep branch no longer checks adminFromRequest");
  assert.ok(guard < firstQuery,
    "the admin check has to come before any operational data is gathered");
});
