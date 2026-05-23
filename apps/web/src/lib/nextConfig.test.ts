import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";

describe("next config", () => {
  it("exposes NEXT_PUBLIC_APP_VERSION for the client bundle", async () => {
    const { default: config } = await import("../../next.config.mjs");

    expect(config.env?.APP_VERSION).toBeTruthy();
    expect(config.env?.NEXT_PUBLIC_APP_VERSION).toBe(config.env?.APP_VERSION);
  });

  it("pins outputFileTracingRoot to the worktree root", async () => {
    const { default: config } = await import("../../next.config.mjs");

    expect(path.normalize(config.outputFileTracingRoot)).toBe(
      path.resolve(process.cwd(), "..", ".."),
    );
  });

  it("allows local dev origins for browser testing over loopback and LAN hosts", async () => {
    const { default: config } = await import("../../next.config.mjs");
    const localIpv4Hosts = Object.values(os.networkInterfaces())
      .flatMap((addresses) => addresses ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => address.address);

    expect(config.allowedDevOrigins).toContain("localhost");
    expect(config.allowedDevOrigins).toContain("127.0.0.1");
    expect(config.allowedDevOrigins).toEqual(expect.arrayContaining(localIpv4Hosts));
  });
});
