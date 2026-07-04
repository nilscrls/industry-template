import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException } from "@nestjs/common";
import { ORPCError } from "@orpc/nest";
import { errorData, isApiErrorData, type ApiErrorData } from "@repo/contracts";
import type { Request, Response } from "express";
import { PinoLogger } from "nestjs-pino";

const STATUS_TO_ORPC_CODE: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_SERVER_ERROR",
};

/**
 * Errors thrown inside oRPC handlers are serialized by oRPC itself. This
 * filter covers everything thrown OUTSIDE them (guards, middleware, plain
 * Nest routes) and emits the exact same wire shape, so the web client's
 * error handling never needs to know where an error originated.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();
    const traceId = request.id;

    const { status, code, message, data } = this.normalize(exception, traceId);

    if (status >= 500) {
      this.logger.error({ err: exception, traceId }, message);
    }

    response.status(status).json({ defined: true, code, status, message, data });
  }

  private normalize(
    exception: unknown,
    traceId: string | undefined
  ): { status: number; code: string; message: string; data: ApiErrorData } {
    if (exception instanceof ORPCError) {
      const data = isApiErrorData(exception.data)
        ? { ...exception.data, traceId: exception.data.traceId ?? traceId }
        : errorData("INTERNAL", {}, traceId);
      return { status: exception.status, code: exception.code, message: exception.message, data };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_TO_ORPC_CODE[status] ?? "INTERNAL_SERVER_ERROR";
      const data =
        status === 429
          ? errorData("RATE_LIMITED", { retryAfterSeconds: 60 }, traceId)
          : status === 404
            ? errorData("RESOURCE_NOT_FOUND", { resource: "route" }, traceId)
            : status < 500
              ? errorData("VALIDATION_FAILED", {}, traceId)
              : errorData("INTERNAL", {}, traceId);
      return { status, code, message: exception.message, data };
    }

    return {
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      data: errorData("INTERNAL", {}, traceId),
    };
  }
}
