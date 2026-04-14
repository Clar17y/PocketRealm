import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryMock);

describe("global-error", () => {
  const consoleErrorSpy = vi.spyOn(console, "error");

  beforeAll(() => {
    consoleErrorSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("captures the error and lets the user retry", async () => {
    const { default: GlobalError } = await import("./global-error");
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "digest-1" });

    render(
      React.createElement(GlobalError, { error, reset }),
    );

    await waitFor(() => {
      expect(sentryMock.captureException).toHaveBeenCalledWith(error);
    });

    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
