import { describe, expect, it } from "vitest";
import { resolveGenesisServerSmokeProfilePatch } from "./server-smoke-profile.js";

describe("Genesis server smoke profile patch", () => {
  it("resolves the pressure preset into a non-empty patch", () => {
    const resolved = resolveGenesisServerSmokeProfilePatch({
      preset: "pressure",
    });

    expect(resolved.preset).toBe("pressure");
    expect(resolved.patch).toMatchObject({
      societyStormTickBonusThreshold: 0.1,
      societyStormTickBonus: 2,
      societyReplicationActionBonusThreshold: 0.1,
      societyReplicationActionBonus: 2,
    });
  });

  it("merges custom override JSON on top of preset values", () => {
    const resolved = resolveGenesisServerSmokeProfilePatch({
      preset: "runaway",
      overrideJson: JSON.stringify({
        societyStormTickBonus: 5,
      }),
    });

    expect(resolved.preset).toBe("runaway");
    expect(resolved.patch).toMatchObject({
      societyStormTickBonusThreshold: 0,
      societyStormTickBonus: 5,
      replicationStormGain: 0.8,
    });
  });

  it("rejects unknown presets", () => {
    expect(() =>
      resolveGenesisServerSmokeProfilePatch({
        preset: "mystery",
      }),
    ).toThrow(/unknown Genesis smoke profile preset/i);
  });
});
