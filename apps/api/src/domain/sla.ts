/**
 * Pure SLA and Escalation Domain Logic — B4
 * Pure function of (issue, slaPolicySnapshot, now, calendar?) so it can be simulated without DB/BullMQ.
 * SPEC §5 & §6
 */

export interface SlaPolicySnapshot {
  id?: string | undefined;
  name?: string | undefined;
  respondHours?: number | undefined;
  resolveHours?: number | undefined;
  escalationLevels?:
    | {
        at_percent: number;
        notify_role: string;
      }[]
    | undefined;
  respondBy?: Date | null | undefined;
  resolveBy?: Date | null | undefined;
}

export interface SlaIssueInput {
  id?: string | undefined;
  publicId: string;
  tenantId: string;
  status: string;
  createdAt: Date;
  slaPolicy?: SlaPolicySnapshot | null | undefined;
  triggeredLevels?: number[] | undefined;
  escalationHistory?: { level: number; triggeredAt: Date; notifyRole: string }[] | undefined;
}

export interface SlaCalendarConfig {
  type?: "24x7" | "business_hours" | "custom" | undefined;
  working_days?: number[] | undefined; // 0=Sun, 1=Mon, ..., 6=Sat
  start_time?: string | undefined; // "09:00"
  end_time?: string | undefined; // "18:00"
  timezone?: string | undefined;
}

export interface EscalationAction {
  level: number; // e.g. at_percent (50, 100)
  atPercent: number;
  notifyRole: string;
  isBreach: boolean;
  triggerTime: Date;
}

export interface SlaEvaluationResult {
  actions: EscalationAction[];
  breached: boolean;
  resolveDeadline: Date;
  triggeredLevels: number[];
}

/**
 * Calculates deadline advancing by calendar hours.
 * Default is 24x7. If business_hours, advances only within working days and hours.
 */
export function addCalendarHours(
  startDate: Date,
  hours: number,
  calendar?: SlaCalendarConfig
): Date {
  if (!calendar || calendar.type !== "business_hours") {
    // 24x7 default
    return new Date(startDate.getTime() + hours * 3_600_000);
  }

  const workingDays = new Set(calendar.working_days ?? [1, 2, 3, 4, 5]);
  const [startH = 9, startM = 0] = (calendar.start_time ?? "09:00").split(":").map(Number);
  const [endH = 18, endM = 0] = (calendar.end_time ?? "18:00").split(":").map(Number);
  const dayWorkMinutes = (endH - startH) * 60 + (endM - startM);

  if (dayWorkMinutes <= 0) {
    return new Date(startDate.getTime() + hours * 3_600_000);
  }

  let remainingMinutes = hours * 60;
  const current = new Date(startDate.getTime());

  // Step minute-by-minute or in efficient chunks
  while (remainingMinutes > 0) {
    const day = current.getDay();
    const isWorkDay = workingDays.has(day);

    if (!isWorkDay) {
      // Advance to next day start_time
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }

    const curHour = current.getHours();
    const curMin = current.getMinutes();
    const curTotalMin = curHour * 60 + curMin;
    const startTotalMin = startH * 60 + startM;
    const endTotalMin = endH * 60 + endM;

    if (curTotalMin < startTotalMin) {
      current.setHours(startH, startM, 0, 0);
      continue;
    }

    if (curTotalMin >= endTotalMin) {
      // Move to next day start
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }

    // Inside working window today
    const availableToday = endTotalMin - curTotalMin;
    if (remainingMinutes <= availableToday) {
      current.setMinutes(current.getMinutes() + remainingMinutes);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= availableToday;
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
    }
  }

  return current;
}

/**
 * Deterministic job ID generator: sla:<issueId>:<level>
 */
export function getSlaJobId(issueId: string, level: number | string): string {
  return `sla:${issueId}:${level}`;
}

const TERMINAL_OR_RESOLVED_STATUSES = new Set(["resolved", "closed", "rejected", "duplicate"]);

/**
 * Pure SLA escalation evaluation function.
 * Evaluates whether any escalation levels are due or breached at `now`.
 * Guaranteed to never return already triggered levels.
 */
export function evaluateEscalations(
  issue: SlaIssueInput,
  policy: SlaPolicySnapshot,
  now: Date,
  calendar?: SlaCalendarConfig
): SlaEvaluationResult {
  const resolveHours = policy.resolveHours ?? 72;
  const escalationLevels = policy.escalationLevels ?? [];

  if (TERMINAL_OR_RESOLVED_STATUSES.has(issue.status)) {
    const resolveDeadline =
      issue.slaPolicy?.resolveBy ?? addCalendarHours(issue.createdAt, resolveHours, calendar);
    return {
      actions: [],
      breached: false,
      resolveDeadline,
      triggeredLevels: issue.triggeredLevels ? [...issue.triggeredLevels] : [],
    };
  }

  const resolveDeadline =
    issue.slaPolicy?.resolveBy ?? addCalendarHours(issue.createdAt, resolveHours, calendar);
  const totalDurationMs = Math.max(1, resolveDeadline.getTime() - issue.createdAt.getTime());

  const alreadyTriggered = new Set<number>(issue.triggeredLevels ?? []);
  if (issue.escalationHistory) {
    for (const h of issue.escalationHistory) {
      alreadyTriggered.add(h.level);
    }
  }

  const actions: EscalationAction[] = [];
  const updatedTriggered = new Set<number>(alreadyTriggered);

  // Sort levels by percentage
  const levels = [...escalationLevels].sort((a, b) => a.at_percent - b.at_percent);

  for (const lvl of levels) {
    const levelKey = lvl.at_percent;
    const triggerMs = issue.createdAt.getTime() + (totalDurationMs * lvl.at_percent) / 100;
    const triggerTime = new Date(triggerMs);

    if (now.getTime() >= triggerTime.getTime()) {
      if (!alreadyTriggered.has(levelKey)) {
        actions.push({
          level: levelKey,
          atPercent: lvl.at_percent,
          notifyRole: lvl.notify_role,
          isBreach: lvl.at_percent >= 100 || now.getTime() >= resolveDeadline.getTime(),
          triggerTime,
        });
        updatedTriggered.add(levelKey);
      }
    }
  }

  const breached = now.getTime() >= resolveDeadline.getTime();

  return {
    actions,
    breached,
    resolveDeadline,
    triggeredLevels: Array.from(updatedTriggered),
  };
}

/**
 * Calculates delayed job scheduling parameters for BullMQ
 */
export function calculateScheduledJobs(
  issue: SlaIssueInput,
  policy: SlaPolicySnapshot,
  now: Date = new Date(),
  calendar?: SlaCalendarConfig
): {
  jobId: string;
  level: number;
  atPercent: number;
  notifyRole: string;
  runAt: Date;
  delayMs: number;
}[] {
  const resolveHours = policy.resolveHours ?? 72;
  const escalationLevels = policy.escalationLevels ?? [];

  if (TERMINAL_OR_RESOLVED_STATUSES.has(issue.status)) {
    return [];
  }

  const resolveDeadline =
    issue.slaPolicy?.resolveBy ?? addCalendarHours(issue.createdAt, resolveHours, calendar);
  const totalDurationMs = Math.max(1, resolveDeadline.getTime() - issue.createdAt.getTime());

  return escalationLevels.map((lvl) => {
    const runAtMs = issue.createdAt.getTime() + (totalDurationMs * lvl.at_percent) / 100;
    const runAt = new Date(runAtMs);
    const delayMs = Math.max(0, runAtMs - now.getTime());
    return {
      jobId: getSlaJobId(issue.publicId, lvl.at_percent),
      level: lvl.at_percent,
      atPercent: lvl.at_percent,
      notifyRole: lvl.notify_role,
      runAt,
      delayMs,
    };
  });
}
