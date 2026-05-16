import type {RootConfig} from '@blinkk/root';
import {Firestore, Timestamp} from 'firebase-admin/firestore';
import {RootCMSClient} from './client.js';

/**
 * Default time-to-live for queued emails. After this elapses without delivery,
 * the email is marked as `expired` by the email worker (see
 * `apps/root-services/main.go`).
 */
const DEFAULT_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;

/** Status values written to the `Emails` queue. */
export type EmailStatus = 'pending' | 'sent' | 'failed' | 'expired';

/** Options for {@link EmailClient.send}. */
export interface SendEmailOptions {
  /** Sender address (e.g. `noreply@example.com`). Required. */
  from: string;
  /** One or more recipient addresses. */
  to: string | string[];
  /** Subject line. */
  subject: string;
  /** Plain-text body. */
  body: string;
  /**
   * Optional HTML body. If omitted, only the plain-text body is delivered.
   * The email worker treats the text body as the source of truth.
   */
  htmlBody?: string;
  /** Optional reply-to address. */
  replyTo?: string;
  /** Optional list of CC addresses. */
  cc?: string | string[];
  /** Optional list of BCC addresses. */
  bcc?: string | string[];
  /**
   * Optional tags to attach to the queued email document for downstream
   * filtering (e.g. analytics, auditing). Stored on the Firestore doc.
   */
  tags?: string[];
  /**
   * Time-to-live override in milliseconds. If the email has not been sent
   * within this window, the worker marks it as `expired` instead of sending.
   * Defaults to 24h.
   */
  ttlMs?: number;
}

/** A row representing a queued email document in Firestore. */
export interface EmailDoc {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  tags?: string[];
  status: EmailStatus;
  createdAt: Timestamp;
  expiredAt?: Timestamp;
  sentAt?: Timestamp;
  error?: string;
}

/** Result returned by {@link EmailClient.send}. */
export interface SendEmailResult {
  /** Firestore doc id assigned to the queued email. */
  id: string;
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return [value];
}

function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of emails) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(email.trim());
  }
  return result;
}

/**
 * Client library for sending emails from server-side code (plugins, cron jobs,
 * api handlers, etc).
 *
 * Emails are written to a Firestore queue at
 * `Projects/<projectId>/Emails`. A separate worker process (e.g. the Go app
 * under `apps/root-services`) reads pending docs and dispatches them via
 * App Engine Mail.
 *
 * Example:
 * ```ts
 * const client = new EmailClient(rootConfig);
 * await client.send({
 *   from: 'noreply@example.com',
 *   to: 'team@example.com',
 *   subject: 'Hello',
 *   body: 'Plain text body.',
 * });
 * ```
 */
export class EmailClient {
  readonly cmsClient: RootCMSClient;
  readonly db: Firestore;
  readonly projectId: string;

  constructor(rootConfigOrClient: RootConfig | RootCMSClient) {
    if (rootConfigOrClient instanceof RootCMSClient) {
      this.cmsClient = rootConfigOrClient;
    } else {
      this.cmsClient = new RootCMSClient(rootConfigOrClient);
    }
    this.db = this.cmsClient.db;
    this.projectId = this.cmsClient.projectId;
  }

  /**
   * Queues an email for delivery. Returns the assigned Firestore doc id.
   *
   * The email is not sent inline. Instead, a Firestore document is written to
   * `Projects/<projectId>/Emails` with `status: 'pending'`. The email worker
   * picks it up, dispatches the message, and updates `status` to `sent`,
   * `failed`, or `expired`.
   */
  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    if (!options.from) {
      throw new Error('email "from" is required');
    }
    if (!options.subject) {
      throw new Error('email "subject" is required');
    }
    if (!options.body) {
      throw new Error('email "body" is required');
    }
    const to = dedupeEmails(toArray(options.to));
    if (to.length === 0) {
      throw new Error('email "to" must include at least one recipient');
    }
    const cc = dedupeEmails(toArray(options.cc));
    const bcc = dedupeEmails(toArray(options.bcc));

    const ttlMs = options.ttlMs ?? DEFAULT_EMAIL_TTL_MS;
    const now = Timestamp.now();
    const expiredAt = Timestamp.fromMillis(now.toMillis() + ttlMs);

    const colRef = this.db.collection(`Projects/${this.projectId}/Emails`);
    const docRef = colRef.doc();
    const data: Record<string, unknown> = {
      id: docRef.id,
      from: options.from,
      to,
      subject: options.subject,
      body: options.body,
      status: 'pending' as EmailStatus,
      createdAt: now,
      expiredAt,
    };
    if (cc.length > 0) {
      data.cc = cc;
    }
    if (bcc.length > 0) {
      data.bcc = bcc;
    }
    if (options.replyTo) {
      data.replyTo = options.replyTo;
    }
    if (options.htmlBody) {
      data.htmlBody = options.htmlBody;
    }
    if (options.tags && options.tags.length > 0) {
      data.tags = options.tags;
    }
    await docRef.set(data);
    return {id: docRef.id};
  }

  /**
   * Returns the most recent emails in the queue. Useful for debugging and
   * admin tooling. By default returns the 50 most recent emails.
   */
  async listRecent(options?: {
    limit?: number;
    status?: EmailStatus;
  }): Promise<EmailDoc[]> {
    const limit = options?.limit ?? 50;
    let query = this.db
      .collection(`Projects/${this.projectId}/Emails`)
      .orderBy('createdAt', 'desc')
      .limit(limit);
    if (options?.status) {
      query = query.where('status', '==', options.status) as typeof query;
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as EmailDoc);
  }
}
