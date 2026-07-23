import { describe, expect, test } from "bun:test";
import { FXArbitrageAgent } from "../src/fx-arbitrage-agent";

describe("FXArbitrageAgent", () => {
  test("executes when triangular spread clears profit barrier", () => {
    const result = FXArbitrageAgent.checkTriangularSpread(
      1000,
      0.255,
      4.02,
      1.03
    );
    expect(result.executed).toBe(true);
    expect(result.grossProfit).toBeGreaterThan(0.005);
    expect(result.systemFees).toBeGreaterThan(0);
  });

  test("skips execution in balanced equilibrium", () => {
    const result = FXArbitrageAgent.checkTriangularSpread(1000, 0.25, 4.0, 1.0);
    expect(result.executed).toBe(false);
    expect(result.systemFees).toBe(0);
  });
});
