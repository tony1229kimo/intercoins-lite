/**
 * A Router that catches async exceptions on its own.
 *
 * Why it is needed: in Express 4, when an async route handler rejects, the
 * exception never reaches the error-handling middleware. The request simply hangs
 * until the client times out. The front end shows only "Failed to fetch" and the
 * server log only an unhandled rejection, so the real cause is invisible.
 *
 * Use asyncRouter() instead of express.Router() and the handlers passed to get,
 * post, patch, put and delete are wrapped in .catch(next), so a missing try/catch
 * cannot leave a request hanging.
 */
import { Router } from "express";

const METHODS = ["get", "post", "put", "patch", "delete", "all", "use"];

function wrap(fn) {
  if (typeof fn !== "function") return fn;
  // Error-handling middleware takes four arguments and must not be wrapped -- wrapping it stops it being an error handler.
  if (fn.length === 4) return fn;
  const wrapped = (req, res, next) => {
    try {
      const out = fn(req, res, next);
      if (out && typeof out.then === "function") out.catch(next);
    } catch (err) {
      next(err);
    }
  };
  Object.defineProperty(wrapped, "name", { value: fn.name || "handler" });
  return wrapped;
}

export function asyncRouter() {
  const router = Router();
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map(wrap));
  }
  return router;
}
