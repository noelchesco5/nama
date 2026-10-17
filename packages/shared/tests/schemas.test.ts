import { describe, expect, it } from "vitest";
import { homeForRole, isAppRole } from "../src/roles";
import { signUpSchema, tzsAmountSchema } from "../src/schemas";

describe("roles", () => {
  it("accepts only the three known roles", () => {
    expect(isAppRole("client")).toBe(true);
    expect(isAppRole("specialist")).toBe(true);
    expect(isAppRole("hq")).toBe(true);
    expect(isAppRole("admin")).toBe(false);
    expect(homeForRole("hq")).toBe("/hq");
  });
});

describe("signUpSchema", () => {
  const base = {
    fullName: "Amina Hassan",
    email: "Amina@Example.com",
    phone: "+255712345678",
    password: "correct-horse",
    intendedRole: "client" as const,
    locale: "en" as const,
    acceptedTerms: true as const,
  };

  it("normalises email and accepts a valid signup", () => {
    const parsed = signUpSchema.parse(base);
    expect(parsed.email).toBe("amina@example.com");
  });

  it("never allows a specialist or client to claim hq at signup", () => {
    const result = signUpSchema.safeParse({ ...base, intendedRole: "hq" });
    expect(result.success).toBe(false);
  });

  it("requires a Tanzanian phone number", () => {
    expect(signUpSchema.safeParse({ ...base, phone: "0712345678" }).success).toBe(false);
  });
});

describe("tzsAmountSchema", () => {
  it("enforces the configured bounds", () => {
    const schema = tzsAmountSchema(1_000n, 2_000_000n);
    expect(schema.safeParse("25000").success).toBe(true);
    expect(schema.safeParse("999").success).toBe(false);
    expect(schema.safeParse("25000.50").success).toBe(false);
  });
});
