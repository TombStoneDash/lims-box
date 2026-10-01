export type CompetencyInput = {
  name: string;
  certifiedDate: string;
  expirationDate: string;
  status: string;
  assessedBy: string;
};

export type StaffInput = {
  name: string;
  competencies: CompetencyInput[];
};

export type CompetencyStatusValue = 'current' | 'expiring-soon' | 'expired' | 'invalid';

export type CompetencyEvaluation = {
  name: string;
  status: CompetencyStatusValue;
  expirationDate: string | null;
  daysRemaining: number | null;
};

export type StaffTrainingEvaluation = {
  name: string;
  status: CompetencyStatusValue;
  expiredCount: number;
  expiringSoonCount: number;
  invalidCount: number;
};

export type TrainingRegistryEvaluation = StaffTrainingEvaluation & {
  totalStaff: number;
};

export const TRAINING_AS_OF_DATE = '2026-04-13';
export const EXPIRING_SOON_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsedDate = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const fromMs = new Date(`${fromIsoDate}T00:00:00Z`).getTime();
  const toMs = new Date(`${toIsoDate}T00:00:00Z`).getTime();
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

export function evaluateCompetency(
  comp: CompetencyInput,
  asOfDate: string = TRAINING_AS_OF_DATE,
): CompetencyEvaluation {
  if (!isValidIsoDate(asOfDate) || !comp || !isValidIsoDate(comp.expirationDate)) {
    return {
      name: comp?.name ?? '',
      status: 'invalid',
      expirationDate: null,
      daysRemaining: null,
    };
  }

  const daysRemaining = daysBetween(asOfDate, comp.expirationDate);

  let status: CompetencyStatusValue;
  if (daysRemaining < 0) {
    status = 'expired';
  } else if (daysRemaining <= EXPIRING_SOON_DAYS) {
    status = 'expiring-soon';
  } else {
    status = 'current';
  }

  return {
    name: comp.name,
    status,
    expirationDate: comp.expirationDate,
    daysRemaining: Math.max(0, daysRemaining),
  };
}

function rollUpStatus(evaluations: CompetencyEvaluation[]): CompetencyStatusValue {
  if (evaluations.some(e => e.status === 'invalid')) return 'invalid';
  if (evaluations.some(e => e.status === 'expired')) return 'expired';
  if (evaluations.some(e => e.status === 'expiring-soon')) return 'expiring-soon';
  return 'current';
}

export function evaluateStaffTraining(
  member: StaffInput,
  asOfDate: string = TRAINING_AS_OF_DATE,
): StaffTrainingEvaluation {
  if (!member || !Array.isArray(member.competencies) || member.competencies.length === 0) {
    return {
      name: member?.name ?? '',
      status: 'invalid',
      expiredCount: 0,
      expiringSoonCount: 0,
      invalidCount: 0,
    };
  }

  const evaluations = member.competencies.map(comp => evaluateCompetency(comp, asOfDate));

  return {
    name: member.name,
    status: rollUpStatus(evaluations),
    expiredCount: evaluations.filter(e => e.status === 'expired').length,
    expiringSoonCount: evaluations.filter(e => e.status === 'expiring-soon').length,
    invalidCount: evaluations.filter(e => e.status === 'invalid').length,
  };
}

export function evaluateTrainingRegistry(
  staffList: StaffInput[],
  asOfDate: string = TRAINING_AS_OF_DATE,
): TrainingRegistryEvaluation {
  if (!Array.isArray(staffList) || staffList.length === 0) {
    return {
      name: '',
      status: 'invalid',
      totalStaff: 0,
      expiredCount: 0,
      expiringSoonCount: 0,
      invalidCount: 0,
    };
  }

  const evaluations = staffList.map(member => evaluateStaffTraining(member, asOfDate));

  return {
    name: '',
    status: rollUpStatus(
      evaluations.map(e => ({ name: e.name, status: e.status, expirationDate: null, daysRemaining: null })),
    ),
    totalStaff: staffList.length,
    expiredCount: evaluations.reduce((sum, e) => sum + e.expiredCount, 0),
    expiringSoonCount: evaluations.reduce((sum, e) => sum + e.expiringSoonCount, 0),
    invalidCount: evaluations.reduce((sum, e) => sum + e.invalidCount, 0),
  };
}

export const TRAINING_AS_OF_LABEL = 'April 13, 2026';

function unreadableDates(count: number): string {
  return `${count} unreadable ${count === 1 ? 'date' : 'dates'}`;
}

/** Header summary. Says "all current" only when every competency is current, and always counts unreadable dates. */
export function registrySummaryText(registry: TrainingRegistryEvaluation): string {
  const asOf = `as of ${TRAINING_AS_OF_LABEL}, synthetic`;
  if (registry.totalStaff === 0) return `No staff training records (${asOf})`;
  if (registry.status === 'current') {
    return `${registry.totalStaff} staff — all competencies current as of ${TRAINING_AS_OF_LABEL} (synthetic)`;
  }
  const parts = [`${registry.expiredCount} expired`, `${registry.expiringSoonCount} expiring within ${EXPIRING_SOON_DAYS} days`];
  if (registry.invalidCount > 0) parts.push(unreadableDates(registry.invalidCount));
  else if (registry.status === 'invalid') parts.push('some training records incomplete');
  return `${registry.totalStaff} staff — ${parts.join(', ')} (${asOf})`;
}

export type RegistryBadge = { label: string; tone: 'green' | 'amber' | 'red' | 'slate' };

/** Badge beside the header: its label and color follow the rolled-up status, so it is green only when all current. */
export function registryBadge(registry: TrainingRegistryEvaluation): RegistryBadge {
  switch (registry.status) {
    case 'current':
      return { label: 'All competencies current', tone: 'green' };
    case 'expiring-soon':
      return { label: `${registry.expiringSoonCount} expiring soon`, tone: 'amber' };
    case 'expired':
      return { label: `${registry.expiredCount} expired`, tone: 'red' };
    default:
      return { label: registry.invalidCount > 0 ? unreadableDates(registry.invalidCount) : 'Training records incomplete', tone: 'slate' };
  }
}
