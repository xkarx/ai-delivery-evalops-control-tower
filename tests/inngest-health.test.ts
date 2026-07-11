import { describe, expect, it } from "vitest";
import { LiveInngestWorkflowAdapter } from "../packages/connectors/src/providers/inngest";

function adapterFor(status: number, capture: { url?: string; init?: RequestInit } = {}) {
  return new LiveInngestWorkflowAdapter({
    env: {
      INTEGRATION_MODE: "live",
      INNGEST_EVENT_KEY: "event-key-must-not-be-used-for-health",
      INNGEST_API_KEY: "api-key-for-health"
    },
    fetch: async (url, init) => {
      capture.url = String(url);
      capture.init = init;
      return new Response(null, { status });
    }
  });
}

describe("Inngest live account health check", () => {
  it("calls the account endpoint with bearer API auth and accepts only HTTP 200", async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const health = await adapterFor(200, capture).healthCheck();
    expect(health.status).toBe("healthy");
    expect(capture.url).toBe("https://api.inngest.com/v2/account");
    expect(capture.init?.method).toBe("GET");
    expect(capture.init?.headers).toEqual({
      authorization: "Bearer api-key-for-health",
      accept: "application/json"
    });
  });

  it.each([
    [401, "UNAUTHORIZED", "invalid"],
    [403, "FORBIDDEN", "permission"],
    [404, "PROVIDER_ERROR", "HTTP 404"],
    [500, "PROVIDER_ERROR", "HTTP 500"]
  ])("maps HTTP %i as a safe health result", async (status, code, detail) => {
    const health = await adapterFor(status).healthCheck();
    expect(health.status).toBe("error");
    expect(health.message).toContain(code);
    expect(health.message).toContain(detail);
  });
});
