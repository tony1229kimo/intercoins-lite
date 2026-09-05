/**
 * Print the same fingerprint /api/health reports, for the working tree.
 *
 * Deploys are otherwise hard to observe: nothing on the public URL changes when
 * a release only touches the admin page or the server. Run this, compare with
 * `curl .../api/health`, and "is my push live?" stops being guesswork.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const h = createHash("sha256");
for (const f of ["index.html", "admin.html", "admin-login.html"]) {
  h.update(readFileSync(join(ROOT, "public", f)));
}
h.update(readFileSync(join(ROOT, "server", "routes", "claim.js")));
h.update(readFileSync(join(ROOT, "server", "routes", "admin.js")));
console.log(h.digest("hex").slice(0, 12));
