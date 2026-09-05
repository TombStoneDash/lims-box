import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInitialPersonnel } from './fixtures';
import type { PersonnelRecord } from './model';
import { TEST_DATA_DOMAIN, TEST_TENANT_ID } from './model';

interface PersonnelStore { schemaVersion: 1; tenantId: typeof TEST_TENANT_ID; dataDomain: typeof TEST_DATA_DOMAIN; personnel: PersonnelRecord[] }

const dataDir = () => process.env.OHWORKS_PERSONNEL_DATA_DIR ?? process.env.OHWORKS_DATA_DIR ?? join(process.cwd(), '.ohworks-test-data');
const personnelPath = () => join(dataDir(), 'personnel-state.json');

function validate(value: unknown): asserts value is PersonnelStore {
  const store = value as PersonnelStore;
  if (store?.schemaVersion !== 1 || store.tenantId !== TEST_TENANT_ID || store.dataDomain !== TEST_DATA_DOMAIN || !Array.isArray(store.personnel)) {
    throw new Error('Personnel store boundary validation failed');
  }
  for (const record of store.personnel) {
    if (record.tenantId !== TEST_TENANT_ID || record.dataDomain !== TEST_DATA_DOMAIN) throw new Error('Cross-tenant personnel data was rejected');
  }
}

export async function readPersonnel(): Promise<PersonnelRecord[]> {
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  try {
    const parsed = JSON.parse(await readFile(personnelPath(), 'utf8')) as unknown;
    validate(parsed);
    return parsed.personnel;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const initial: PersonnelStore = { schemaVersion: 1, tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, personnel: createInitialPersonnel() };
    validate(initial);
    const temporary = `${personnelPath()}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(initial, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, personnelPath());
    return initial.personnel;
  }
}
