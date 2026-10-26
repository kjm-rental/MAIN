import { afterEach, expect, it, vi } from "vitest";
import { paymongoLiveMode } from "./mode";
afterEach(() => vi.unstubAllEnvs());
it.each(["live", "LIVE", " Live "])(
  "accepts explicit live mode %s without changing readiness flags",
  (value) => {
    vi.stubEnv("PAYMONGO_MODE", value);
    vi.stubEnv("PAYMONGO_LIVE_ENABLED", "false");
    expect(paymongoLiveMode()).toBe(true);
    expect(process.env.PAYMONGO_LIVE_ENABLED).toBe("false");
  },
);
it.each(["test", "TEST", "", "other"])(
  "does not select live mode for %s",
  (value) => {
    vi.stubEnv("PAYMONGO_MODE", value);
    expect(paymongoLiveMode()).toBe(false);
  },
);
