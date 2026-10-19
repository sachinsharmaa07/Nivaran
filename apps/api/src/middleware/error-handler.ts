import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { createErrorResponse } from "@nivaran/shared";

export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId || "req-unknown";

  if (err instanceof ZodError) {
    const details = err.issues.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    res
      .status(400)
      .json(
        createErrorResponse(
          "VALIDATION_ERROR",
          "Request input validation failed",
          requestId,
          details
        )
      );
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json(createErrorResponse(err.code, err.message, requestId, err.details));
    return;
  }

  console.error(`[UnhandledError ${requestId}]`, err);
  res
    .status(500)
    .json(
      createErrorResponse(
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred. Please try again later.",
        requestId
      )
    );
}
