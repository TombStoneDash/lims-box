import {
  authorizeAnalystRelease, explainAuthorizationRule,
  type AnalystRecord, type ReleaseCandidate, type AuthorizationSummary,
} from './ohworks-analyst-authorization';
import {
  evaluateLockoutState, requiresSupervisorOverrideToUnlock,
  type PoctLockoutInput, type PoctLockoutState,
} from './ohworks-poct-lockout';

export const DEMO_NOW = '2026-09-19T12:00:00.000Z';

/** All identifiers, competency periods and QC windows are fabricated examples. */
export function createPilotReleaseAuthorizationFixtures(): {
  releases: { analyst: AnalystRecord; candidate: ReleaseCandidate }[];
  devices: PoctLockoutInput[];
} {
  const releases = Array.from({ length: 7 }, (_, index) => ({
    analyst: {
      analystId: `SYNTHETIC-ANALYST-${String(index + 1).padStart(2, '0')}`,
      role: 'ANALYST' as const,
      competencies: [{ method: 'SYNTHETIC-METHOD-01', assessedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z' }],
    } as AnalystRecord,
    candidate: {
      resultId: `SYNTHETIC-RES-${String(index + 1).padStart(3, '0')}`,
      method: 'SYNTHETIC-METHOD-01', flag: 'ROUTINE', timestamp: DEMO_NOW,
    } as ReleaseCandidate,
  }));
  releases[1].candidate.flag = 'CRITICAL';
  releases[1].candidate.secondReviewerId = 'SYNTHETIC-ANALYST-08';
  releases[2].candidate.flag = 'CRITICAL';
  releases[3].candidate.flag = 'CRITICAL';
  releases[3].candidate.secondReviewerId = releases[3].analyst.analystId;
  releases[4].analyst.competencies[0].expiresAt = '2026-09-18T00:00:00.000Z';
  releases[5].analyst.suspension = { startsAt: '2026-09-18T00:00:00.000Z', endsAt: '2026-09-20T00:00:00.000Z' };
  releases[6].candidate.method = 'SYNTHETIC-METHOD-02';
  const devices: PoctLockoutInput[] = [
    { deviceId: 'SYNTHETIC-POCT-01', lastQcResult: 'pass', lastQcAt: '2026-09-19T10:40:00.000Z', now: DEMO_NOW, qcFrequencyHours: 8, priorLockoutActive: false },
    { deviceId: 'SYNTHETIC-POCT-02', lastQcResult: 'fail', lastQcAt: '2026-09-19T11:00:00.000Z', now: DEMO_NOW, qcFrequencyHours: 8, priorLockoutActive: false },
    { deviceId: 'SYNTHETIC-POCT-03', lastQcResult: 'pass', lastQcAt: '2026-09-19T02:00:00.000Z', now: DEMO_NOW, qcFrequencyHours: 8, priorLockoutActive: false },
    { deviceId: 'SYNTHETIC-POCT-04', lastQcResult: 'not_run', lastQcAt: null, now: DEMO_NOW, qcFrequencyHours: 8, priorLockoutActive: false },
  ];
  return { releases, devices };
}

export interface PilotReleaseAuthorizationView {
  now: string;
  releaseRows: (AuthorizationSummary & { method: string; flag: ReleaseCandidate['flag']; analystId: string; explanation: string })[];
  deviceRows: (PoctLockoutState & { deviceId: string; lastQcResult: PoctLockoutInput['lastQcResult']; hoursSinceLastQc: string; overrideRequired: boolean })[];
  counts: { refusedReleases: number; lockedDevices: number };
}

/** Pure rule demonstration; no authentication, persistence or backing server. */
export function buildPilotReleaseAuthorizationView(): PilotReleaseAuthorizationView {
  const fixtures = createPilotReleaseAuthorizationFixtures();
  const releaseRows = fixtures.releases.map(({ analyst, candidate }) => {
    const result = authorizeAnalystRelease(analyst, candidate);
    return { ...result, method: candidate.method, flag: candidate.flag, analystId: analyst.analystId,
      explanation: explainAuthorizationRule(result.rule) };
  });
  const deviceRows = fixtures.devices.map((device) => {
    const result = evaluateLockoutState(device);
    return { ...result, deviceId: device.deviceId, lastQcResult: device.lastQcResult,
      hoursSinceLastQc: device.lastQcAt === null ? '—' : ((Date.parse(device.now) - Date.parse(device.lastQcAt)) / 3_600_000).toFixed(1),
      overrideRequired: requiresSupervisorOverrideToUnlock({ locked: result.locked, lastQcResult: device.lastQcResult }) };
  });
  return { now: DEMO_NOW, releaseRows, deviceRows, counts: {
    refusedReleases: releaseRows.filter((row) => row.decision === 'REFUSED').length,
    lockedDevices: deviceRows.filter((row) => row.locked).length,
  } };
}
