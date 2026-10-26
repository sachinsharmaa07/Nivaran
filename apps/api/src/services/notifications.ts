/**
 * Notification Service — B4
 * Handles Nodemailer (Mailpit) + Mongo in-app notification records.
 * Non-blocking, retries on SMTP failure, never blocks the API request.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { pino } from "pino";
import { Notification, type INotification } from "../db/models/notification.model.js";
import { connectMongo } from "../db/mongo.js";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

export type NotificationType = "assign" | "resolve" | "escalation" | "reopen";

export interface NotificationPayload {
  tenantId: string;
  userId: string;
  role?: string | undefined;
  recipientEmail?: string | undefined;
  locale?: string | undefined;
  issueId: string;
  type: NotificationType;
  meta?: Record<string, string | number | undefined> | undefined;
}

interface LocalizedContent {
  title: string;
  body: string;
}

const TEMPLATES: Record<
  NotificationType,
  Record<string, (meta: Record<string, string | number | undefined>) => LocalizedContent>
> = {
  assign: {
    en: (m) => {
      const id = String(m["issueId"] ?? "");
      const dept = String(m["department"] ?? "department");
      return {
        title: `Issue ${id} Assigned`,
        body: `Issue ${id} has been assigned to ${dept} for action.`,
      };
    },
    hi: (m) => {
      const id = String(m["issueId"] ?? "");
      const dept = String(m["department"] ?? "विभाग");
      return {
        title: `शिकायत ${id} आवंटित`,
        body: `शिकायत ${id} को कार्यवाही हेतु ${dept} को आवंटित किया गया है।`,
      };
    },
    pa: (m) => {
      const id = String(m["issueId"] ?? "");
      const dept = String(m["department"] ?? "ਵਿਭਾਗ");
      return {
        title: `ਸ਼ਿਕਾਇਤ ${id} ਸੌਂਪੀ ਗਈ`,
        body: `ਸ਼ਿਕਾਇਤ ${id} ਨੂੰ ਕਾਰਵਾਈ ਲਈ ${dept} ਨੂੰ ਸੌਂਪ ਦਿੱਤਾ ਗਿਆ ਹੈ।`,
      };
    },
  },
  resolve: {
    en: (m) => {
      const id = String(m["issueId"] ?? "");
      return {
        title: `Issue ${id} Resolved — Confirmation Required`,
        body: `Issue ${id} has been marked as resolved. Please confirm or dispute this resolution.`,
      };
    },
    hi: (m) => {
      const id = String(m["issueId"] ?? "");
      return {
        title: `शिकायत ${id} का समाधान — पुष्टि आवश्यक`,
        body: `शिकायत ${id} का समाधान कर दिया गया है। कृपया समाधान की पुष्टि या विरोध करें।`,
      };
    },
    pa: (m) => {
      const id = String(m["issueId"] ?? "");
      return {
        title: `ਸ਼ਿਕਾਇਤ ${id} ਦਾ ਹੱਲ — ਪੁਸ਼ਟੀ ਦੀ ਲੋੜ`,
        body: `ਸ਼ਿਕਾਇਤ ${id} ਦਾ ਨਿਪਟਾਰਾ ਕਰ ਦਿੱਤਾ ਗਿਆ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਹੱਲ ਦੀ ਪੁਸ਼ਟੀ ਜਾਂ ਵਿਰੋਧ ਕਰੋ।`,
      };
    },
  },
  escalation: {
    en: (m) => {
      const id = String(m["issueId"] ?? "");
      const pct = String(m["atPercent"] ?? 100);
      const role = String(m["notifyRole"] ?? "staff");
      return {
        title: `SLA Escalation: Issue ${id} (${pct}%)`,
        body: `Issue ${id} has reached ${pct}% of its SLA target. Role notified: ${role}.`,
      };
    },
    hi: (m) => {
      const id = String(m["issueId"] ?? "");
      const pct = String(m["atPercent"] ?? 100);
      const role = String(m["notifyRole"] ?? "कर्मचारी");
      return {
        title: `एसएलए एस्केलेशन: शिकायत ${id} (${pct}%)`,
        body: `शिकायत ${id} अपनी समय सीमा के ${pct}% पर पहुंच गई है। सूचित भूमिका: ${role}।`,
      };
    },
    pa: (m) => {
      const id = String(m["issueId"] ?? "");
      const pct = String(m["atPercent"] ?? 100);
      const role = String(m["notifyRole"] ?? "ਸਟਾਫ");
      return {
        title: `ਐਸਐਲਏ ਐਸਕੇਲੇਸ਼ਨ: ਸ਼ਿਕਾਇਤ ${id} (${pct}%)`,
        body: `ਸ਼ਿਕਾਇਤ ${id} ਆਪਣੀ ਸਮਾਂ ਸੀਮਾ ਦੇ ${pct}% 'ਤੇ ਪਹੁੰਚ ਗਈ ਹੈ। ਸੂਚਿਤ ਭੂਮਿਕਾ: ${role}।`,
      };
    },
  },
  reopen: {
    en: (m) => {
      const id = String(m["issueId"] ?? "");
      return {
        title: `Issue ${id} Reopened`,
        body: `Issue ${id} has been reopened following a citizen dispute.`,
      };
    },
    hi: (m) => {
      const id = String(m["issueId"] ?? "");
      return {
        title: `शिकायत ${id} पुनः खोली गई`,
        body: `नागरिक द्वारा असहमति दर्ज करने के बाद शिकायत ${id} पुनः खोल दी गई है।`,
      };
    },
    pa: (m) => {
      const id = String(m["issueId"] ?? "");
      return {
        title: `ਸ਼ਿਕਾਇਤ ${id} ਮੁੜ ਖੋਲ੍ਹੀ ਗਈ`,
        body: `ਨਾਗਰਿਕ ਵੱਲੋਂ ਇਤਰਾਜ਼ ਉਠਾਏ ਜਾਣ 'ਤੇ ਸ਼ਿਕਾਇਤ ${id} ਮੁੜ ਖੋਲ੍ਹ ਦਿੱਤੀ ਗਈ ਹੈ।`,
      };
    },
  },
};

function getLocalizedContent(
  type: NotificationType,
  locale: string | undefined,
  meta: Record<string, string | number | undefined>
): LocalizedContent {
  const normalizedLocale = locale && ["en", "hi", "pa"].includes(locale) ? locale : "en";
  const typeTemplates = TEMPLATES[type];
  const templateFn = typeTemplates[normalizedLocale] ?? typeTemplates["en"]!;
  return templateFn(meta);
}

function createTransporter(): Transporter {
  const host = process.env["SMTP_HOST"] ?? "localhost";
  const port = Number(process.env["SMTP_PORT"] ?? 1025);
  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 2500,
    greetingTimeout: 2500,
  });
}

let cachedTransporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!cachedTransporter) {
    cachedTransporter = createTransporter();
  }
  return cachedTransporter;
}

/**
 * Dispatch notification asynchronously:
 * 1. Writes in-app Notification record in Mongo
 * 2. Attempts email send via nodemailer with retry
 * 3. Never throws; never blocks caller
 */
export async function sendNotification(payload: NotificationPayload): Promise<INotification> {
  await connectMongo();

  let recipientEmail = payload.recipientEmail;
  let locale = payload.locale;

  if (
    !recipientEmail &&
    payload.userId &&
    !payload.userId.includes(":") &&
    payload.userId !== "anonymous"
  ) {
    try {
      const { TenantDb } = await import("../db/tenant-db.js");
      const tenantDb = new TenantDb(payload.tenantId);
      const user = await tenantDb.findUserById(payload.userId);
      if (user) {
        if (user.email) recipientEmail = user.email;
        if (!locale && user.locale) locale = user.locale;
      }
    } catch {
      // ignore lookup error
    }
  }

  const metaWithId = { ...payload.meta, issueId: payload.issueId };
  const { title, body } = getLocalizedContent(payload.type, locale, metaWithId);

  // Create in-app notification record
  const notification = await Notification.create({
    tenantId: payload.tenantId,
    userId: payload.userId,
    role: payload.role,
    issueId: payload.issueId,
    type: payload.type,
    title,
    body,
    data: payload.meta,
    read: false,
    emailStatus: "skipped",
  });

  // If email recipient specified, fire background email send
  if (recipientEmail) {
    void sendEmailWithRetry(String(notification._id), recipientEmail, title, body).catch((err) => {
      log.warn({ err, notificationId: notification._id }, "Unexpected notification failure");
    });
  }

  return notification;
}

async function sendEmailWithRetry(
  notificationId: string,
  to: string,
  subject: string,
  text: string,
  maxRetries = 2
): Promise<void> {
  const from = process.env["MAIL_FROM"] ?? "no-reply@nivaran.gov.in";
  const transporter = getTransporter();

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
        headers: { "X-Nivaran-Notification": notificationId },
      });

      await Notification.findByIdAndUpdate(notificationId, {
        $set: { emailStatus: "sent" },
      });
      return;
    } catch (err) {
      log.warn(
        { attempt, maxRetries, err: (err as Error)?.message },
        "SMTP send failed, retrying..."
      );
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  // All attempts failed -> record failure
  try {
    await Notification.findByIdAndUpdate(notificationId, {
      $set: { emailStatus: "failed" },
    });
  } catch {
    // ignore
  }
}
