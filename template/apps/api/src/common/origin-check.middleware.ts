import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF posture, layered (no token scheme needed):
 *  1. Better-Auth session cookies are SameSite=Lax — browsers do not attach
 *     them to cross-site POSTs, so forged mutations arrive unauthenticated.
 *  2. Better-Auth itself validates Origin against `trustedOrigins` for its
 *     own endpoints (sign-in, organization mutations, 2FA, SSO callback).
 *  3. This middleware covers the oRPC procedures: a state-changing request
 *     that CARRIES an Origin header must come from the web app. Requests
 *     without one (curl, server-to-server, mobile SDKs) pass — they are not
 *     CSRF-able because browsers always send Origin on cross-site writes.
 */
export function originCheckMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const origin = req.headers.origin;
  if (SAFE_METHODS.has(req.method) || !origin || origin === env.WEB_URL) {
    next();
    return;
  }
  res.status(403).json({
    defined: true,
    code: "FORBIDDEN",
    status: 403,
    message: "Cross-origin write rejected",
    data: {
      code: "AUTH_FORBIDDEN",
      params: { action: "write", subject: "cross-origin" },
    },
  });
}
