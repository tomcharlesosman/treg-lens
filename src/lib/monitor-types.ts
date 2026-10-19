import type { AuditInput } from "./aeo";

export type MonitorInput = {
  enabled: boolean;
  intervalHours: 24 | 168;
  hourUtc: number;
  perRunBudgetUsd: number;
  monthlyBudgetUsd: number;
  config: Omit<AuditInput, "token">;
};
export type MonitorSchedule = MonitorInput & {
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string;
  lastError: string | null;
  spentMonthUsd: number;
  recoveryAudit?: { completedAt: string; url: string };
};
export type MonitorState = {
  schedule: MonitorSchedule | null;
  worker: { lastSeenAt: string | null; healthy: boolean };
};
