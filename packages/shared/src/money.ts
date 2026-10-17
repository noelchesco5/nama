export const TZS = "TZS" as const;

export const MINOR_UNITS = 1n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function toBigInt(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new MoneyError("amount must be a whole number of shillings");
    if (!Number.isSafeInteger(value)) throw new MoneyError("amount is outside the safe integer range");
    return BigInt(value);
  }
  const cleaned = value.replace(/[\s,_]/g, "").replace(/^TZS/i, "");
  if (!/^-?\d+$/.test(cleaned)) throw new MoneyError(`not a whole number of shillings: ${value}`);
  return BigInt(cleaned);
}

export function parseTzs(value: bigint | number | string): bigint {
  return toBigInt(value);
}

export function formatTzs(amount: bigint | number | string): string {
  const value = toBigInt(amount);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${TZS} ${grouped}`;
}

export function addTzs(...amounts: Array<bigint | number | string>): bigint {
  return amounts.reduce<bigint>((total, amount) => total + toBigInt(amount), 0n);
}

export function subTzs(a: bigint | number | string, b: bigint | number | string): bigint {
  return toBigInt(a) - toBigInt(b);
}

export function isNegative(amount: bigint): boolean {
  return amount < 0n;
}

export function assertNotNegative(amount: bigint, label = "amount"): void {
  if (amount < 0n) throw new MoneyError(`${label} must not be negative`);
}

export const DEFAULT_FEE_BPS = 700n;

export const BPS_DENOMINATOR = 10_000n;

export function assertValidFeeBps(feeBps: bigint): void {
  if (feeBps < 0n || feeBps > BPS_DENOMINATOR) throw new MoneyError("fee bps must be between 0 and 10000");
}

export function computeFee(amount: bigint | number | string, feeBps: bigint = DEFAULT_FEE_BPS): bigint {
  assertValidFeeBps(feeBps);
  const value = toBigInt(amount);
  assertNotNegative(value);
  return (value * feeBps + BPS_DENOMINATOR / 2n) / BPS_DENOMINATOR;
}

export function netAfterFee(amount: bigint | number | string, feeBps: bigint = DEFAULT_FEE_BPS): bigint {
  const value = toBigInt(amount);
  return value - computeFee(value, feeBps);
}

export function feeBpsToPercent(feeBps: bigint): string {
  const whole = feeBps / 100n;
  const fraction = feeBps % 100n;
  if (fraction === 0n) return `${whole}`;
  return `${whole}.${fraction.toString().padStart(2, "0")}`;
}

export function percentToFeeBps(percent: string | number): bigint {
  const text = typeof percent === "number" ? percent.toString() : percent.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new MoneyError(`not a percentage: ${percent}`);
  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "0").padEnd(2, "0"));
  return whole * 100n + fraction;
}
