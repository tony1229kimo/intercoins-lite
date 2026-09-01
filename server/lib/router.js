/**
 * 會自動接住 async 例外的 Router。
 *
 * 為什麼需要：Express 4 的 route handler 如果是 async function 且 reject，
 * 例外【不會】被送到錯誤處理 middleware —— 請求就這樣掛著，直到 client 逾時。
 * 前端只會看到「Failed to fetch」，伺服器 log 只有 UnhandledPromiseRejection，
 * 完全查不出真正原因。這就是味蕾旅遊地圖 POSTMORTEM Bug #3 的同一個坑：
 * 錯誤被吃掉 → 現場所有人猜錯方向。
 *
 * 用 asyncRouter() 取代 express.Router()，get/post/patch/put/delete 的 handler
 * 都會自動包上 .catch(next)，忘記寫 try/catch 也不會讓請求 hang 住。
 */
import { Router } from "express";

const METHODS = ["get", "post", "put", "patch", "delete", "all", "use"];

function wrap(fn) {
  if (typeof fn !== "function") return fn;
  // 錯誤處理 middleware 是 4 個參數，不能包（包了就不再是錯誤處理器）。
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
