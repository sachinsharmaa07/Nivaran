import type { Request, Response, NextFunction } from "express";
import { createErrorResponse } from "@nivaran/shared";
import { redisRateLimit } from "../db/redis.js";

function extractIdentifier(req: Request): string {
  const body = req.body ?? {};
  const raw = body.identifier || body.email || body.phone || "";
  return String(raw).toLowerCase().trim();
}

/**
 * Rate limit middleware: 5 requests per minute per IP plus identifier.
 * Returns 429 with code RATE_LIMITED, standard error shape and Retry-After header.
 */
export function authRateLimiter(action: string, limit = 5, windowSeconds = 60) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const identifier = extractIdentifier(req) || "none";
    const key = `rl:auth:${action}:${ip}:${identifier}`;

    const { ttl, allowed } = await redisRateLimit(key, limit, windowSeconds);

    if (!allowed) {
      res.setHeader("Retry-After", String(ttl));
      res
        .status(429)
        .json(
          createErrorResponse(
            "RATE_LIMITED",
            "Too many requests. Please try again later.",
            req.requestId || "req-unknown",
            { retryAfter: ttl }
          )
        );
      return;
    }

    next();
  };
}
