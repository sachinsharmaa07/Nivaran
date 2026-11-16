/**
 * Post Publisher Scheduler — C1
 * BullMQ delayed jobs for scheduled civic update publishing.
 * Deterministic job ID: post:<id>:publish.
 * Idempotent: fires exactly once even after worker restarts.
 */
import { Queue, Worker } from "bullmq";
import { pino } from "pino";
import { getBullMqRedisConfig } from "./sla-queue.js";
import { ContentRepo } from "../db/content-repo.js";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

export const POST_PUBLISHER_QUEUE_NAME = "post-publisher";

export interface PostPublishJobData {
  tenantId: string;
  postId: string;
}

export function getPostPublishJobId(postId: string): string {
  return `post:${postId}:publish`;
}

let postQueueInstance: Queue<PostPublishJobData> | null = null;

export function getPostPublisherQueue(): Queue<PostPublishJobData> {
  if (!postQueueInstance) {
    postQueueInstance = new Queue<PostPublishJobData>(POST_PUBLISHER_QUEUE_NAME, {
      connection: getBullMqRedisConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return postQueueInstance;
}

export async function schedulePostPublish(
  tenantId: string,
  postId: string,
  scheduledFor: Date
): Promise<void> {
  const queue = getPostPublisherQueue();
  const jobId = getPostPublishJobId(postId);
  const delay = Math.max(0, scheduledFor.getTime() - Date.now());

  // Remove any pre-existing job with this ID
  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // ignore
  }

  await queue.add(
    "publish-post",
    { tenantId, postId },
    {
      jobId,
      delay,
    }
  );

  log.info(
    { tenantId, postId, jobId, delayMs: delay },
    `[PostScheduler] Enqueued scheduled publish for post ${postId}`
  );
}

export async function cancelPostPublish(postId: string): Promise<void> {
  try {
    const queue = getPostPublisherQueue();
    const jobId = getPostPublishJobId(postId);
    const existing = await queue.getJob(jobId);
    if (existing) {
      await existing.remove();
      log.info({ postId, jobId }, `[PostScheduler] Cancelled scheduled publish for post ${postId}`);
    }
  } catch (err) {
    log.warn({ postId, err }, `[PostScheduler] Error cancelling job for post ${postId}`);
  }
}

export async function processPublishJob(job: { data: PostPublishJobData }): Promise<void> {
  const { tenantId, postId } = job.data;
  const repo = new ContentRepo(tenantId);
  const post = await repo.getPostById(postId);

  if (!post) {
    log.warn({ tenantId, postId }, `[PostScheduler] Post not found for scheduled publish`);
    return;
  }

  if (post.status !== "scheduled") {
    log.info(
      { tenantId, postId, status: post.status },
      `[PostScheduler] Post is no longer in 'scheduled' status; skipping publish`
    );
    return;
  }

  await repo.setPostStatus(postId, "published", { publishedAt: new Date() });
  log.info({ tenantId, postId, slug: post.slug }, `[PostScheduler] Successfully published post`);
}

export const processPostPublishJob = processPublishJob;

let postWorkerInstance: Worker<PostPublishJobData> | null = null;

export function startPostPublisherWorker(): Worker<PostPublishJobData> {
  if (postWorkerInstance) return postWorkerInstance;

  postWorkerInstance = new Worker<PostPublishJobData>(
    POST_PUBLISHER_QUEUE_NAME,
    async (job) => {
      await processPublishJob(job);
    },
    {
      connection: getBullMqRedisConfig(),
      concurrency: 5,
    }
  );

  postWorkerInstance.on("completed", (job) => {
    log.info({ jobId: job.id }, `[PostPublisherWorker] Job completed`);
  });

  postWorkerInstance.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, `[PostPublisherWorker] Job failed`);
  });

  return postWorkerInstance;
}

export async function closePostPublisher(): Promise<void> {
  if (postWorkerInstance) {
    await postWorkerInstance.close();
    postWorkerInstance = null;
  }
  if (postQueueInstance) {
    await postQueueInstance.close();
    postQueueInstance = null;
  }
}
