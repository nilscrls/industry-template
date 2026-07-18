import { HttpException } from "@nestjs/common";
import { ORPCError } from "@orpc/nest";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "winston";
import type { PostHogService } from "../analytics/posthog.service";
import { AllExceptionsFilter } from "./exception.filter";

interface SentResponse {
  body: { code: string; data: { code: string; traceId?: string } };
  status: number;
}

function run(exception: unknown): {
  sent: SentResponse;
  errorLog: ReturnType<typeof vi.fn>;
} {
  const errorLog = vi.fn();
  const logger = {
    child: () => ({ error: errorLog }),
  } as unknown as Logger;
  const posthog = {
    captureException: vi.fn(),
  } as unknown as PostHogService;
  const filter = new AllExceptionsFilter(logger, posthog);

  let sent: SentResponse | undefined;
  const response = {
    status(code: number) {
      return {
        json(body: SentResponse["body"]) {
          sent = { status: code, body };
        },
      };
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ id: "trace-1" }),
    }),
  };

  filter.catch(exception, host as never);
  if (!sent) {
    throw new Error("filter did not respond");
  }
  return { sent, errorLog };
}

describe("AllExceptionsFilter", () => {
  it("passes app errors through and injects the traceId", () => {
    const { sent } = run(
      new ORPCError("NOT_FOUND", {
        data: { code: "RESOURCE_NOT_FOUND", params: { resource: "Project" } },
      })
    );
    expect(sent.status).toBe(404);
    expect(sent.body.data.code).toBe("RESOURCE_NOT_FOUND");
    expect(sent.body.data.traceId).toBe("trace-1");
  });

  it("maps throttling to the RATE_LIMITED catalog code", () => {
    const { sent } = run(new HttpException("Too Many Requests", 429));
    expect(sent.status).toBe(429);
    expect(sent.body.code).toBe("TOO_MANY_REQUESTS");
    expect(sent.body.data.code).toBe("RATE_LIMITED");
  });

  it("hides unknown errors behind INTERNAL and logs them", () => {
    const { sent, errorLog } = run(new Error("boom"));
    expect(sent.status).toBe(500);
    expect(sent.body.data.code).toBe("INTERNAL");
    expect(errorLog).toHaveBeenCalled();
  });
});
