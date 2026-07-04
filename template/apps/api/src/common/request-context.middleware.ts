import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { requestContext } from "./request-context";

/**
 * First middleware in the stack: assigns the request id (honoring an inbound
 * x-request-id from the reverse proxy) and opens the AsyncLocalStorage scope
 * every downstream layer — logger, guards, services, filter — reads from.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const headerValue = req.headers["x-request-id"];
  const requestId =
    (Array.isArray(headerValue) ? headerValue[0] : headerValue) ?? randomUUID();
  (req as Request & { id?: string }).id = requestId;
  res.setHeader("x-request-id", requestId);
  requestContext.run({ requestId }, next);
}
