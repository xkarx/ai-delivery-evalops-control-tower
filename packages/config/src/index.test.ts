import { describe, expect, it } from "vitest";
import { assertModeSafety, loadConfig } from "./index";

describe("configuration", () => {
  it("defaults to credential-free synthetic mock mode", () => {
    const config = loadConfig({});
    expect(config.demoMode).toBe("synthetic");
    expect(config.integrationMode).toBe("mock");
    expect(Object.values(config.providers).every((value) => !value)).toBe(true);
  });

  it("rejects a credential-free live mode", () => {
    const config = loadConfig({ INTEGRATION_MODE: "live" });
    expect(() => assertModeSafety(config)).toThrow(/requires at least one/);
  });
});
