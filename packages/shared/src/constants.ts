import { DEFAULT_FEE_BPS } from "./money";

export const SETTINGS_DEFAULTS = {
  platformFeeBps: DEFAULT_FEE_BPS,
  topUpMinTzs: 1_000n,
  topUpMaxTzs: 2_000_000n,
  topUpDeadlineMinutes: 10,
  acceptanceWindowMinutes: 15,
  cancellationFullRefundHours: 6,
  cancellationPartialMaxBps: 7_500n,
  cancellationUnderOneHourMaxBps: 5_000n,
  bookingAutoCompleteHours: 24,
  arrivalGraceMinutes: 30,
  savedPlacePromptCooldownDays: 14,
  savedPlaceMaxDismissals: 2,
  analyticsMinCellCount: 5,
} as const;

export const QUICK_TOPUP_TZS: readonly bigint[] = [10_000n, 20_000n, 50_000n];
