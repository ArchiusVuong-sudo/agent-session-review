import { describe, expect, it, vi } from "vitest";
import { isAuthError, isRetryable, withRetry } from "@/lib/checker/retry";

const noSleep = () => Promise.resolve();

describe("retry", () => {
  it.each(["API overloaded", "429 Too Many Requests", "rate_limit", "500 Internal Server Error", "API 529", "socket ECONNRESET"])(
    "retries %s",
    (message) => expect(isRetryable(new Error(message))).toBe(true),
  );

  it.each(["400 invalid request", "Output does not match the findings schema", "not logged in"])("does not retry %s", (message) =>
    expect(isRetryable(new Error(message))).toBe(false),
  );

  it("backs off exponentially and returns the first success", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("API overloaded");
        return "ok";
      },
      { baseDelayMs: 1000, sleep: async (ms) => void delays.push(ms) },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(delays[0]).toBeGreaterThanOrEqual(750);
    expect(delays[0]).toBeLessThanOrEqual(1250);
    expect(delays[1]).toBeGreaterThanOrEqual(1500);
    expect(delays[1]).toBeLessThanOrEqual(2500);
  });

  it("gives up after the last attempt and on non-retryable errors at once", async () => {
    const fn = vi.fn(async () => {
      throw new Error("503 Service Unavailable");
    });
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow("503");
    expect(fn).toHaveBeenCalledTimes(3);
    const bad = vi.fn(async () => {
      throw new Error("400 bad request");
    });
    await expect(withRetry(bad, { sleep: noSleep })).rejects.toThrow("400");
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("caps the delay", async () => {
    const delays: number[] = [];
    await expect(
      withRetry(
        async () => {
          throw new Error("overloaded");
        },
        { attempts: 6, baseDelayMs: 10000, maxDelayMs: 12000, sleep: async (ms) => void delays.push(ms) },
      ),
    ).rejects.toThrow();
    expect(Math.max(...delays)).toBeLessThanOrEqual(15000);
  });

  it("spots auth failures", () => {
    expect(isAuthError(new Error("authentication failed: not logged in"))).toBe(true);
    expect(isAuthError(new Error("Invalid API key"))).toBe(true);
    expect(isAuthError(new Error("API overloaded"))).toBe(false);
  });
});
