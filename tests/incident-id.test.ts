import { describe, expect, it } from "vitest";
import { createIncidentNumericId } from "../apps/control-tower/lib/incident-id";

describe("incident IDs", () => {
  it("remain decimal and schema-safe without reusing prior incident magnitude", () => {
    const id = createIncidentNumericId(1_784_011_187_348, 4321);

    expect(id).toBe("17840111873484321");
    expect(`INC-${id}`).toMatch(/^INC-\d{4,}$/);
    expect(`EVALCASE-${id}`).toMatch(/^EVALCASE-\d{4,}$/);
    expect(id).not.toContain("e+");
  });

  it("rejects non-four-digit entropy", () => {
    expect(() => createIncidentNumericId(1_784_011_187_348, 10_000)).toThrow(/four decimal digits/i);
  });
});
