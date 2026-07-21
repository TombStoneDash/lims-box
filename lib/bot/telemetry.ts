import type { BotResponse } from './engine';

export type BotTelemetryOutcome =
  | 'grounded_answer'
  | 'compliance_answer'
  | 'evidence_missing'
  | 'invalid_request'
  | 'rate_limited'
  | 'internal_error';

export interface BotTelemetryEvent {
  schema_version: '1.0';
  event: 'lims_bot_request';
  outcome: BotTelemetryOutcome;
  grounded: boolean | null;
  source_count: number;
  source_paths: string[];
  has_follow_up: boolean;
  follow_up_path: string | null;
}

export interface BotTelemetrySink {
  info: (event: string, fields: BotTelemetryEvent) => void;
  warn: (event: string, fields: BotTelemetryEvent) => void;
}

const DEFAULT_SINK: BotTelemetrySink = {
  info: (event, fields) => console.info(event, fields),
  warn: (event, fields) => console.warn(event, fields),
};

function baseEvent(outcome: BotTelemetryOutcome): BotTelemetryEvent {
  return {
    schema_version: '1.0',
    event: 'lims_bot_request',
    outcome,
    grounded: null,
    source_count: 0,
    source_paths: [],
    has_follow_up: false,
    follow_up_path: null,
  };
}

export function telemetryForBotResponse(response: BotResponse): BotTelemetryEvent {
  const sourcePaths = [...new Set(response.sources.map((source) => source.path))];
  const outcome: BotTelemetryOutcome = response.grounded
    ? sourcePaths.includes('/compliance')
      ? 'compliance_answer'
      : 'grounded_answer'
    : 'evidence_missing';

  return {
    ...baseEvent(outcome),
    grounded: response.grounded,
    source_count: response.sources.length,
    source_paths: sourcePaths,
    has_follow_up: Boolean(response.followUp),
    follow_up_path: response.followUp?.path ?? null,
  };
}

export function telemetryForRequestOutcome(
  outcome: Extract<BotTelemetryOutcome, 'invalid_request' | 'rate_limited' | 'internal_error'>,
): BotTelemetryEvent {
  return baseEvent(outcome);
}

export function recordBotTelemetry(
  telemetry: BotTelemetryEvent,
  sink: BotTelemetrySink = DEFAULT_SINK,
): void {
  const method = telemetry.outcome === 'internal_error' ? sink.warn : sink.info;
  method('lims_bot_request', telemetry);
}
