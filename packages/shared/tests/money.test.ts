import { describe, expect, it } from "vitest";
import {
  addTzs,
  computeFee,
  DEFAULT_FEE_BPS,
  feeBpsToPercent,
  formatTzs,
  MoneyError,
  netAfterFee,
  parseTzs,
  percentToFeeBps,
  subTzs,
} from "../src/money";

describe("parseTzs", () => {
  it("accepts bigint, safe integers and grouped strings", () => {
    expect(parseTzs(25_000n)).toBe(25_000n);
    expect(parseTzs(25_000)).toBe(25_000n);
    expect(parseTzs("25,000")).toBe(25_000n);
    expect(parseTzs("TZS 25 000")).toBe(25_000n);
  });

  it("rejects fractions and junk", () => {
    expect(() => parseTzs(1.5)).toThrow(MoneyError);
    expect(() => parseTzs("25.50")).toThrow(MoneyError);
    expect(() => parseTzs("abc")).toThrow(MoneyError);
  });
});

describe("formatTzs", () => {
  it("formats with the TZS prefix and grouping", () => {
    expect(formatTzs(0n)).toBe("TZS 0");
    expect(formatTzs(25_000n)).toBe("TZS 25,000");
    expect(formatTzs(1_234_567n)).toBe("TZS 1,234,567");
    expect(formatTzs(-4_000n)).toBe("-TZS 4,000");
  });
});

describe("arithmetic", () => {
  it("adds and subtracts whole shillings", () => {
    expect(addTzs(10_000, 20_000, "5000")).toBe(35_000n);
    expect(subTzs(35_000n, 5_000n)).toBe(30_000n);
  });
});

describe("platform fee (7 percent default)", () => {
  it("exposes 7 percent as 700 bps", () => {
    expect(DEFAULT_FEE_BPS).toBe(700n);
    expect(feeBpsToPercent(DEFAULT_FEE_BPS)).toBe("7");
  });

  it("rounds half up to whole shillings", () => {
    expect(computeFee(25_000n)).toBe(1_750n);
    expect(computeFee(1n)).toBe(0n);
    expect(computeFee(7n)).toBe(0n);
    expect(computeFee(8n)).toBe(1n);
    expect(computeFee(10_001n)).toBe(700n);
  });

  it("splits price into fee and specialist earnings without losing a shilling", () => {
    for (const price of [0n, 1n, 999n, 15_000n, 25_000n, 1_000_007n]) {
      const fee = computeFee(price);
      const net = netAfterFee(price);
      expect(fee + net).toBe(price);
    }
  });

  it("parses and formats percentages", () => {
    expect(percentToFeeBps("7")).toBe(700n);
    expect(percentToFeeBps("7.5")).toBe(750n);
    expect(percentToFeeBps("0.25")).toBe(25n);
    expect(feeBpsToPercent(750n)).toBe("7.50");
  });

  it("refuses an out-of-range fee", () => {
    expect(() => computeFee(1_000n, 10_001n)).toThrow(MoneyError);
  });
});
