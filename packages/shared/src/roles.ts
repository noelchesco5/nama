export const ROLES = ["client", "specialist", "hq"] as const;

export type AppRole = (typeof ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_HOME: Record<AppRole, string> = {
  client: "/(client)",
  specialist: "/(specialist)",
  hq: "/hq",
};

export function homeForRole(role: AppRole): string {
  return ROLE_HOME[role];
}

export const SPECIALIST_STATUSES = ["pending", "approved", "suspended"] as const;
export type SpecialistStatus = (typeof SPECIALIST_STATUSES)[number];
