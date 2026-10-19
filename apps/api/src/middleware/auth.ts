import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type TokenPayload } from "../auth/jwt.js";
import { TenantDb } from "../db/tenant-db.js";
import { AppError } from "./error-handler.js";
import type { Role } from "@nivaran/shared";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      tenantDb?: TenantDb;
    }
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.slice(7).trim();
  try {
    const payload = await verifyAccessToken(token);
    req.user = payload;
    if (payload.tid) {
      req.tenantDb = new TenantDb(payload.tid);
    }
    next();
  } catch {
    next(
      new AppError("INVALID_TOKEN", "The provided authentication token is invalid or expired", 401)
    );
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", "Authentication required to access this resource", 401);
  }
  next();
}

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError("UNAUTHORIZED", "Authentication required to access this resource", 401);
    }

    const userRoles = req.user.roles || [req.user.role];
    const hasRole = allowedRoles.some((r) => userRoles.includes(r));

    if (!hasRole) {
      throw new AppError(
        "FORBIDDEN",
        `Access denied. Requires one of roles: ${allowedRoles.join(", ")}`,
        403
      );
    }
    next();
  };
}
