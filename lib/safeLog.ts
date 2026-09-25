import { NotificationDeliveryError } from './notify';

type SafeErrorMeta = {
  errorName: string;
  errorCode?: string;
  httpStatus?: number;
  reason?: NotificationDeliveryError['reason'];
  stage?: NotificationDeliveryError['stage'];
};

// Read only explicitly allowed fields; hostile getters must not break a handler.
function field(value: unknown, key: string): unknown {
  try {
    return value !== null && (typeof value === 'object' || typeof value === 'function')
      ? (value as Record<string, unknown>)[key] : undefined;
  } catch {
    return undefined;
  }
}

export function safeErrorMeta(err: unknown): SafeErrorMeta {
  const name = field(err, 'name');
  const code = field(err, 'code');
  const status = field(err, 'httpStatus');
  const meta: SafeErrorMeta = { errorName: typeof name === 'string' ? name : typeof err };
  if (typeof code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(code)) meta.errorCode = code;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) {
    meta.httpStatus = status;
  }
  if (err instanceof NotificationDeliveryError) {
    meta.reason = err.reason;
    meta.stage = err.stage;
  }
  return meta;
}

export function maskEmail(email: unknown): string {
  if (typeof email !== 'string' || email.length > 254) return '[redacted]';
  const parts = /^([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)$/.exec(email);
  if (!parts || parts[1].length > 64) return '[redacted]';
  return `${parts[1][0]}***@${parts[2]}`;
}

export function leadLogMeta(record: Record<string, unknown>): Record<string, string | boolean | null> {
  return {
    emailMasked: maskEmail(record.email),
    hasName: Boolean(record.name),
    hasLabName: Boolean(record.labName),
    hasMessage: Boolean(record.message),
    hasPhone: Boolean(record.phone),
    source: typeof record.source === 'string' && record.source.length <= 60
      && /^[\w .:/-]+$/.test(record.source) ? record.source : null,
    timestamp: typeof record.timestamp === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.timestamp)
      ? record.timestamp : null,
  };
}
