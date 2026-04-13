import { describe, expect, it } from "vitest";

describe("next config", () => {
  it("exposes NEXT_PUBLIC_APP_VERSION for the client bundle", async () => {
    const { default: config } = await import("../../next.config.mjs");

    expect(config.env?.APP_VERSION).toBeTruthy();
    expect(config.env?.NEXT_PUBLIC_APP_VERSION).toBe(config.env?.APP_VERSION);
  });
});
