export type CompetencyInput = {
  name: string;
  certifiedDate: string;
  expirationDate: string;
  status: string;
  assessedBy: string;
};

export type StaffInput = {
  name: string;
  role: string;
  employeeId: string;
  hireDate: string;
  signatureEnabled: boolean;
  competencies: CompetencyInput[];
};

export type CompetencyStatusValue = 'current' | 'expiring-soon' | 'expired' | 'invalid';

export type CompetencyEvaluation = {
  name: string;
  status: CompetencyStatusValue;
  expirationDate: string | null;
  daysRemaining: number;
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

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function evaluateCompetency(
  comp: CompetencyInput,
  asOfDate: string = TRAINING_AS_OF_DATE,
): CompetencyEvaluation {
  if (!comp || !isValidIsoDate(comp.expirationDate)) {
    return {
      name: comp?.name ?? '',
      status: 'invalid',
      expirationDate: null,
      daysRemaining: 0,
    };
  }

  const asOfMs = new Date(`${asOfDate}T00:00:00Z`).getTime();
  const expirationMs = new Date(`${comp.expirationDate}T00:00:00Z`).getTime();
  const daysRemaining = Math.max(0, Math.round((expirationMs - asOfMs) / MS_PER_DAY));

  let status: CompetencyStatusValue;
  if (comp.expirationDate < asOfDate) {
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
    daysRemaining,
  };
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

  const expiredCount = evaluations.filter(e => e.status === 'expired').length;
  const expiringSoonCount = evaluations.filter(e => e.status === 'expiring-soon').length;
  const invalidCount = evaluations.filter(e => e.status === 'invalid').length;

  const status: CompetencyStatusValue =
    invalidCount > 0 ? 'invalid' : expiredCount > 0 ? 'expired' : expiringSoonCount > 0 ? 'expiring-soon' : 'current';

  return {
    name: member.name,
    status,
    expiredCount,
    expiringSoonCount,
    invalidCount,
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

  const expiredCount = evaluations.reduce((sum, e) => sum + e.expiredCount, 0);
  const expiringSoonCount = evaluations.reduce((sum, e) => sum + e.expiringSoonCount, 0);
  const invalidCount = evaluations.reduce((sum, e) => sum + e.invalidCount, 0);

  const status: CompetencyStatusValue =
    invalidCount > 0 ? 'invalid' : expiredCount > 0 ? 'expired' : expiringSoonCount > 0 ? 'expiring-soon' : 'current';

  return {
    name: '',
    status,
    totalStaff: staffList.length,
    expiredCount,
    expiringSoonCount,
    invalidCount,
  };
}
