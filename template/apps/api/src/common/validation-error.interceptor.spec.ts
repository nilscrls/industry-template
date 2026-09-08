import { ORPCError } from "@orpc/nest";
import { describe, expect, it } from "vitest";
import { appError } from "./app-error";
import { validationErrorInterceptor } from "./validation-error.interceptor";

describe("validationErrorInterceptor", () => {
  it("passes results through untouched", async () => {
    await expect(
      validationErrorInterceptor({ next: () => Promise.resolve({ ok: true }) })
    ).resolves.toEqual({ ok: true });
  });

  it("re-wraps oRPC's raw input-validation error as VALIDATION_FAILED", async () => {
    const raw = new ORPCError("BAD_REQUEST", {
      message: "Input validation failed",
      data: { issues: [{ message: "Too small" }] },
    });
    await expect(
      validationErrorInterceptor({ next: () => Promise.reject(raw) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { code: "VALIDATION_FAILED", params: {} },
    });
  });

  it("leaves errors that already carry the contract payload alone", async () => {
    const typed = appError("WALLET_INSUFFICIENT_BALANCE", {
      balance: 0,
      requested: 5,
    });
    await expect(
      validationErrorInterceptor({ next: () => Promise.reject(typed) })
    ).rejects.toBe(typed);
  });
});
