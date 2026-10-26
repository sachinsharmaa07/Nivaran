/**
 * BullMQ SLA Escalation Queue and Scheduler — B4
 * One delayed job per issue per escalation level with job id sla:<issueId>:<level>.
 * Retries with backoff; failed jobs go to failed list viewable/retriable by tenant_admin.
 * Idempotent: restarts never double-fire.
 */
import { Queue, Worker, type Job } from "bullmq";
import { pino } from "pino";
import fs from "node:fs";
import { IssueRepo } from "../db/issue-repo.js";
import { TenantDb } from "../db/tenant-db.js";
import { sendNotification } from "./notifications.js";
import {
  calculateScheduledJobs,
  getSlaJobId,
  type SlaCalendarConfig,
  type SlaPolicySnapshot,
} from "../domain/sla.js";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

export const SLA_QUEUE_NAME = "sla-escalations";

export interface SlaJobData {
  tenantId: string;
  issueId: string; // publicId
  level: number;
  notifyRole: string;
  atPercent: number;
}

export function getBullMqRedisConfig(): { host: string; port: number; maxRetriesPerRequest: null } {
  const raw = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const inDocker = Boolean(process.env["IN_DOCKER"]) || fs.existsSync("/.dockerenv");
  let host = "localhost";
  let port = 6379;
  try {
    const url = new URL(raw);
    host = url.hostname || "localhost";
    if (!inDocker && host === "redis") {
      host = "localhost";
    }
    port = url.port ? Number(url.port) : 6379;
  } catch {
    // defaults
  }
  return { host, port, maxRetriesPerRequest: null };
}

let queueInstance: Queue<SlaJobData> | null = null;

export function getSlaQueue(): Queue<SlaJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<SlaJobData>(SLA_QUEUE_NAME, {
      connection: getBullMqRedisConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }
  return queueInstance;
}

/**
 * Schedule delayed SLA jobs for an issue when created or deadline updated.
 */
export async function scheduleSlaJobs(
  tenantId: string,
  issue: {
    publicId: string;
    createdAt: Date;
    status: string;
    triggeredLevels?: number[] | undefined;
  },
  policy: SlaPolicySnapshot,
  calendar?: SlaCalendarConfig
): Promise<void> {
  const queue = getSlaQueue();
  const jobsToSchedule = calculateScheduledJobs(
    {
      publicId: issue.publicId,
      tenantId,
      status: issue.status,
      createdAt: issue.createdAt,
      triggeredLevels: issue.triggeredLevels,
    },
    policy,
    new Date(),
    calendar
  );

  for (const item of jobsToSchedule) {
    try {
      await queue.add(
        "escalate",
        {
          tenantId,
          issueId: issue.publicId,
          level: item.level,
          notifyRole: item.notifyRole,
          atPercent: item.atPercent,
        },
        {
          jobId: item.jobId,
          delay: item.delayMs,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        }
      );
    } catch (err) {
      log.warn({ err, jobId: item.jobId }, "Failed to schedule BullMQ SLA job");
    }
  }
}

/**
 * Cancel and remove scheduled SLA jobs for an issue (on resolve, close, or merge).
 */
export async function cancelSlaJobs(
  issuePublicId: string,
  policyLevels?: { at_percent: number }[]
): Promise<void> {
  const queue = getSlaQueue();

  // If specific levels provided, remove directly
  if (policyLevels && policyLevels.length > 0) {
    for (const lvl of policyLevels) {
      const jobId = getSlaJobId(issuePublicId, lvl.at_percent);
      try {
        const job = await queue.getJob(jobId);
        if (job) {
          await job.remove();
        }
      } catch {
        // ignore
      }
    }
    return;
  }

  // Otherwise, inspect delayed and waiting jobs
  try {
    const jobs = await queue.getJobs(["delayed", "waiting"]);
    for (const job of jobs) {
      if (job.id?.startsWith(`sla:${issuePublicId}:`)) {
        await job.remove();
      }
    }
  } catch (err) {
    log.warn({ err, issuePublicId }, "Failed to cancel SLA jobs");
  }
}

/**
 * Worker processor for an individual SLA escalation job.
 * Guaranteed idempotent: restarts never double-fire.
 */
export async function processSlaJob(
  job: Job<SlaJobData>
): Promise<{ executed: boolean; reason?: string }> {
  const { tenantId, issueId, level, notifyRole, atPercent } = job.data;
  const repo = new IssueRepo(tenantId);
  const issue = await repo.findByPublicId(issueId);

  if (!issue) {
    return { executed: false, reason: "issue_not_found" };
  }

  // Terminal or resolved statuses do not escalate
  const terminalStatuses = ["resolved", "closed", "rejected", "duplicate"];
  if (terminalStatuses.includes(issue.status)) {
    return { executed: false, reason: "issue_resolved_or_terminal" };
  }

  // Check if this level has already been triggered on the issue document
  if (issue.triggeredLevels?.includes(level)) {
    log.info({ issueId, level }, "SLA escalation level already fired on issue, skipping");
    return { executed: false, reason: "already_triggered_on_issue" };
  }

  // Double-check audit events for defense-in-depth against worker restarts
  const auditEvents = await repo.listAuditEvents(issueId);
  const alreadyInAudit = auditEvents.some(
    (e) =>
      e.event === "ESCALATION" &&
      typeof e.payload === "object" &&
      e.payload !== null &&
      (e.payload as Record<string, unknown>)["level"] === level
  );

  if (alreadyInAudit) {
    log.info({ issueId, level }, "SLA escalation level already in audit trail, skipping");
    return { executed: false, reason: "already_in_audit" };
  }

  // Atomically record escalation on the issue in Mongo
  const updated = await repo.recordEscalation(issueId, {
    level,
    notifyRole,
    triggeredAt: new Date(),
  });

  if (!updated) {
    log.info({ issueId, level }, "Concurrent escalation record prevented double-fire");
    return { executed: false, reason: "concurrency_guard" };
  }

  // Append audit event
  await repo.appendAuditEvent({
    issueId,
    actor: { userId: "system", role: "sla_worker" },
    event: "ESCALATION",
    payload: { level, notifyRole, atPercent },
  });

  // If breach (100% or above), flag sla_breached in Postgres metrics fact
  if (atPercent >= 100) {
    try {
      const tenantDb = new TenantDb(tenantId);
      await tenantDb.recordIssueMetric({
        issue_id: issueId,
        status: issue.status,
        sla_breached: true,
      });
    } catch (err) {
      log.warn({ err, issueId }, "Failed to update Postgres sla_breached flag");
    }
  }

  // Trigger notification for this escalation
  try {
    await sendNotification({
      tenantId,
      userId: `role:${notifyRole}`,
      role: notifyRole,
      issueId,
      type: "escalation",
      meta: { atPercent, notifyRole },
    });
  } catch (err) {
    log.warn({ err, issueId }, "Failed to send escalation notification");
  }

  return { executed: true };
}

/**
 * List failed SLA jobs for a specific tenant (tenant_admin visibility)
 */
export async function getFailedSlaJobs(tenantId: string): Promise<
  {
    jobId: string;
    issueId: string;
    level: number;
    notifyRole: string;
    atPercent: number;
    failedReason: string;
    attemptsMade: number;
    timestamp: number;
  }[]
> {
  const queue = getSlaQueue();
  const failed = await queue.getJobs(["failed"]);
  return failed
    .filter((job) => job.data?.tenantId === tenantId)
    .map((job) => ({
      jobId: String(job.id),
      issueId: job.data.issueId,
      level: job.data.level,
      notifyRole: job.data.notifyRole,
      atPercent: job.data.atPercent,
      failedReason: job.failedReason || "Unknown failure",
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    }));
}

/**
 * Retry a failed SLA job (tenant_admin action)
 */
export async function retryFailedSlaJob(
  tenantId: string,
  jobId: string
): Promise<{ success: boolean; message: string }> {
  const queue = getSlaQueue();
  const job = await queue.getJob(jobId);
  if (!job) {
    return { success: false, message: "Job not found" };
  }
  if (job.data?.tenantId !== tenantId) {
    return { success: false, message: "Unauthorized job retry" };
  }
  await job.retry();
  return { success: true, message: "Job retried successfully" };
}

/**
 * Start the BullMQ worker instance
 */
export function startSlaWorker(): Worker<SlaJobData> {
  const worker = new Worker<SlaJobData>(
    SLA_QUEUE_NAME,
    async (job) => {
      await processSlaJob(job);
    },
    {
      connection: getBullMqRedisConfig(),
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    log.debug({ jobId: job.id }, "SLA escalation job completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, "SLA escalation job failed");
  });

  return worker;
}
