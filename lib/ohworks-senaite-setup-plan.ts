/** Pure synthetic setup planning; no requests or account provisioning occur here. */
export interface OHWorksSetupEntity {
  id: string;
  title: string;
}

export interface OHWorksSenaiteSetupConfig {
  client: OHWorksSetupEntity & { contacts?: readonly OHWorksSetupEntity[] };
  sampleTypes: readonly OHWorksSetupEntity[];
  analysisServices: readonly {
    title: string;
    keyword: string;
    unit: string;
    /** Shared synthetic category title; categories are deduplicated by this value. */
    category: string;
  }[];
  analysisProfiles: readonly {
    title: string;
    keyword: string;
    serviceKeywords: readonly string[];
  }[];
  instrument: OHWorksSetupEntity & { model: string };
  /** LabContact records only. Login provisioning is a separate operator task. */
  labUsers: readonly OHWorksSetupEntity[];
}

export type OHWorksSenaiteSetupErrorCode =
  | 'invalid-config' | 'credential-field' | 'empty-title'
  | 'duplicate-keyword' | 'unknown-service' | 'non-synthetic-identity';

export class OHWorksSenaiteSetupPlanError extends Error {
  constructor(readonly code: OHWorksSenaiteSetupErrorCode) {
    // Never echo input values, keys, or paths (which could contain credentials).
    super(`OHWorks synthetic setup rejected: ${code}`);
    this.name = 'OHWorksSenaiteSetupPlanError';
  }
}

/** Resolve $ref to the earlier create result's UID, or path for a parent field.
 * Payloads are planning templates, not ready-to-submit HTTP bodies. The operator
 * must also select the appropriate site/setup container before each create.
 */
export type OHWorksSetupReference = { $ref: number };
export interface OHWorksSenaiteSetupStep {
  order: number;
  portalType: 'Client' | 'Contact' | 'SampleType' | 'AnalysisCategory'
    | 'AnalysisService' | 'AnalysisProfile' | 'Instrument' | 'LabContact';
  endpoint: '/@@API/senaite/v1/create';
  payload: Record<string, string | OHWorksSetupReference | OHWorksSetupReference[]>;
  /** One-based order numbers of prerequisite steps. */
  dependsOn: number[];
}

function fail(code: OHWorksSenaiteSetupErrorCode): never {
  throw new OHWorksSenaiteSetupPlanError(code);
}

/** Inspect even unused fields, without invoking getters or copying arbitrary keys. */
function inspect(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') fail('invalid-config');
  if (ancestors.has(value)) fail('invalid-config');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype
    && Object.getPrototypeOf(value) !== null) fail('invalid-config');
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail('invalid-config');
    if (/password|secret|token/i.test(key)) fail('credential-field');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor)) fail('invalid-config');
    if (key.toLowerCase() === 'title'
      && (typeof descriptor.value !== 'string' || !descriptor.value.trim())) fail('empty-title');
    inspect(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-config');
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) fail('invalid-config');
  return value;
}

function text(value: unknown, title = false): string {
  if (typeof value !== 'string' || !value.trim()) fail(title ? 'empty-title' : 'invalid-config');
  if (value !== value.trim()) fail('invalid-config');
  return value;
}

function synthetic(value: unknown, title = false): string {
  const result = text(value, title);
  if (!result.startsWith('SYNTHETIC-') || result.length <= 'SYNTHETIC-'.length) {
    fail('non-synthetic-identity');
  }
  return result;
}

export function buildOHWorksSenaiteSetupPlan(config: OHWorksSenaiteSetupConfig): OHWorksSenaiteSetupStep[] {
  inspect(config);
  const input = record(config);
  const steps: OHWorksSenaiteSetupStep[] = [];
  const keywords = new Set<string>();
  const ids = new Set<string>();
  const keyword = (value: unknown) => {
    const result = synthetic(value);
    if (keywords.has(result)) fail('duplicate-keyword');
    keywords.add(result);
    return result;
  };
  const entity = (value: unknown) => {
    const item = record(value);
    const id = synthetic(item.id);
    if (ids.has(id)) fail('invalid-config');
    ids.add(id);
    return { id, title: synthetic(item.title, true) };
  };
  const add = (portalType: OHWorksSenaiteSetupStep['portalType'],
    payload: OHWorksSenaiteSetupStep['payload'], dependsOn: number[] = []) => {
    const order = steps.length + 1;
    steps.push({ order, portalType, endpoint: '/@@API/senaite/v1/create',
      payload: { portal_type: portalType, ...payload }, dependsOn });
    return order;
  };
  const client = record(input.client);
  const clientOrder = add('Client', entity(client));
  for (const contact of list(client.contacts ?? [])) {
    add('Contact', { ...entity(contact), parent: { $ref: clientOrder } }, [clientOrder]);
  }
  for (const sample of list(input.sampleTypes)) add('SampleType', entity(sample));
  const instrument = record(input.instrument);
  add('Instrument', { ...entity(instrument), Model: synthetic(instrument.model) });
  const categories = new Map<string, number>();
  const services = list(input.analysisServices).map(record);
  for (const service of services) {
    const category = synthetic(service.category, true);
    if (!categories.has(category)) categories.set(category, add('AnalysisCategory', { title: category }));
  }
  const serviceOrders = new Map<string, number>();
  for (const service of services) {
    const key = keyword(service.keyword);
    const categoryOrder = categories.get(service.category as string)!;
    serviceOrders.set(key, add('AnalysisService', {
      title: synthetic(service.title, true), Keyword: key, Unit: text(service.unit),
      Category: { $ref: categoryOrder },
    }, [categoryOrder]));
  }
  for (const value of list(input.analysisProfiles)) {
    const profile = record(value);
    const key = keyword(profile.keyword);
    const dependencies = list(profile.serviceKeywords).map(value => {
      const order = serviceOrders.get(synthetic(value));
      if (order === undefined) fail('unknown-service');
      return order;
    });
    if (!dependencies.length || new Set(dependencies).size !== dependencies.length) fail('invalid-config');
    add('AnalysisProfile', { title: synthetic(profile.title, true), ProfileKey: key,
      Services: dependencies.map(order => ({ $ref: order })) }, dependencies);
  }
  for (const user of list(input.labUsers)) add('LabContact', entity(user));
  return steps;
}

export const DEFAULT_OHWORKS_SYNTHETIC_CONFIG: OHWorksSenaiteSetupConfig = {
  client: { id: 'SYNTHETIC-CLIENT-001', title: 'SYNTHETIC-Occupational Health Client',
    contacts: [{ id: 'SYNTHETIC-CONTACT-001', title: 'SYNTHETIC-Client Contact' }] },
  sampleTypes: [{ id: 'SYNTHETIC-SERUM', title: 'SYNTHETIC-Serum' }],
  analysisServices: [
    { title: 'SYNTHETIC-Measles IgG Immunity Titre', keyword: 'SYNTHETIC-MEASLES-IGG',
      unit: 'AU/mL', category: 'SYNTHETIC-Serology' },
    { title: 'SYNTHETIC-Rubella IgG Immunity Titre', keyword: 'SYNTHETIC-RUBELLA-IGG',
      unit: 'IU/mL', category: 'SYNTHETIC-Serology' },
  ],
  analysisProfiles: [{ title: 'SYNTHETIC-Occupational Immunity Panel',
    keyword: 'SYNTHETIC-IMMUNITY-PANEL', serviceKeywords: ['SYNTHETIC-MEASLES-IGG', 'SYNTHETIC-RUBELLA-IGG'] }],
  instrument: { id: 'SYNTHETIC-INSTRUMENT-001', title: 'SYNTHETIC-LIAISON XL', model: 'SYNTHETIC-LIAISON XL' },
  labUsers: [{ id: 'SYNTHETIC-ANALYST-001', title: 'SYNTHETIC-Laboratory Analyst' }],
};
