export const pilotMeta = {
  client: 'OHWorks',
  title: 'Controlled Pilot Workspace',
  annualVolumeRange: '30,000–40,000',
  deploymentPreference: 'Cloud may be acceptable; architecture decision pending',
  instrumentCandidate: 'DiaSorin family; exact analyzer and protocol unconfirmed',
  dataClass: 'Synthetic demonstration data only',
  status: 'Discovery and local prototype',
} as const;

export const workflowStages = [
  {
    name: 'Accessioned',
    owner: 'Receiving',
    control: 'Unique synthetic accession and required fields',
  },
  {
    name: 'Queued',
    owner: 'Interface service',
    control: 'Mapped order with idempotency key',
  },
  {
    name: 'Instrument result',
    owner: 'Analyzer adapter',
    control: 'Parsed values retained with source-message evidence',
  },
  {
    name: 'Technical review',
    owner: 'Authorized reviewer',
    control: 'Flags and exceptions require a human decision',
  },
  {
    name: 'Released',
    owner: 'Authorized signatory',
    control: 'Release is separate from ingestion and fully audited',
  },
] as const;

export const syntheticSamples = [
  {
    id: 'OW-SYN-10040',
    panel: 'Synthetic occupational-health profile',
    state: 'Accessioned',
    instrument: 'Not yet routed',
    received: '09:05',
    flag: 'Required fields complete',
  },
  {
    id: 'OW-SYN-10041',
    panel: 'Synthetic serology panel',
    state: 'Technical review',
    instrument: 'Analyzer candidate A',
    received: '09:12',
    flag: 'Equivocal component',
  },
  {
    id: 'OW-SYN-10042',
    panel: 'Synthetic immunity screen',
    state: 'Instrument result',
    instrument: 'Analyzer candidate A',
    received: '09:18',
    flag: 'None',
  },
  {
    id: 'OW-SYN-10043',
    panel: 'Synthetic occupational-health profile',
    state: 'Queued',
    instrument: 'Mapping pending',
    received: '09:26',
    flag: 'Unmapped order code',
  },
  {
    id: 'OW-SYN-10044',
    panel: 'Synthetic antibody screen',
    state: 'Released',
    instrument: 'Analyzer candidate A',
    received: '08:54',
    flag: 'Human reviewed',
  },
] as const;

export const instrumentMappings = [
  {
    instrumentCode: 'SYN-AB-01',
    canonicalTest: 'Synthetic antibody screen',
    components: '1',
    status: 'Ready for simulator',
  },
  {
    instrumentCode: 'SYN-SER-PANEL',
    canonicalTest: 'Synthetic serology panel',
    components: '4',
    status: 'Review component rules',
  },
  {
    instrumentCode: 'DISCOVERY-REQ',
    canonicalTest: 'Customer test menu not supplied',
    components: 'Unknown',
    status: 'Discovery required',
  },
] as const;

export const interfaceControls = [
  ['Transport', 'ASTM is a candidate; confirm analyzer, connection mode, encoding, and framing'],
  ['Identity', 'Bind message, specimen, order, and component identifiers without relying on display text'],
  ['Idempotency', 'Persist a message fingerprint and reject exact replay before any result promotion'],
  ['Quarantine', 'Unknown test, malformed message, duplicate, or missing order stops in a review queue'],
  ['Traceability', 'Retain redacted raw-message hash, parser version, mapping version, and reviewer action'],
  ['Release', 'Instrument ingestion never releases a result; an authorized human workflow remains separate'],
] as const;

export const faultCategories = [
  { name: 'Message integrity', action: 'Quarantine and preserve evidence' },
  { name: 'Sample integrity', action: 'Hold for operator review' },
  { name: 'Reagent or calibration', action: 'Hold affected results and link the instrument event' },
  { name: 'QC exception', action: 'Block result promotion until documented review' },
  { name: 'Mapping exception', action: 'No guessed mapping; require an approved mapping revision' },
] as const;

export const syntheticPersonnel = [
  {
    id: 'SYN-P01',
    name: 'Morgan Ellis',
    role: 'Biomedical Scientist',
    competency: 'Serology review',
    authorization: 'Active; synthetic scope',
    nextReview: '2026-11-14',
  },
  {
    id: 'SYN-P02',
    name: 'Samira Khan',
    role: 'Laboratory Technician',
    competency: 'Analyzer operation',
    authorization: 'Training only',
    nextReview: '2026-10-03',
  },
  {
    id: 'SYN-P03',
    name: 'Alex Morgan',
    role: 'Quality Lead',
    competency: 'Competence assessment',
    authorization: 'Reviewer; synthetic scope',
    nextReview: '2027-01-22',
  },
] as const;

export const auditEvents = [
  {
    at: '2026-09-01 09:31',
    actor: 'SYN-P02',
    action: 'Training evidence attached',
    object: 'Analyzer operation / v0 discovery procedure',
  },
  {
    at: '2026-09-01 09:36',
    actor: 'SYN-P03',
    action: 'Competence review recorded',
    object: 'SYN-P02 / analyzer operation',
  },
  {
    at: '2026-09-01 09:44',
    actor: 'SYSTEM',
    action: 'Result quarantined',
    object: 'OW-SYN-10043 / unmapped order code',
  },
] as const;

export const discoveryGates = [
  {
    area: 'Clinical and accreditation scope',
    question: 'What workflow and governing requirement is the pilot intended to support?',
    owner: 'Customer clinical/quality lead',
  },
  {
    area: 'Instrument',
    question: 'Confirm exact make, model, software version, protocol, connection method, and sample messages.',
    owner: 'Customer IT + lab lead',
  },
  {
    area: 'Test menu and volume',
    question: 'Confirm tests, components, reflex rules, peak throughput, and the 30k–40k annual estimate.',
    owner: 'Lab lead',
  },
  {
    area: 'Users and roles',
    question: 'Name pilot users, assessors, authorizers, administrators, and least-privilege roles.',
    owner: 'Customer sponsor',
  },
  {
    area: 'Hosting and privacy',
    question: 'Decide UK data location, identity provider, retention, backup, incident, and supplier requirements.',
    owner: 'Customer IT / information governance',
  },
  {
    area: 'Pilot success',
    question: 'Choose one workflow, baseline, measurable result, acceptance owner, and exit condition.',
    owner: 'Joint',
  },
] as const;

export const readinessRows = [
  { capability: 'Synthetic workflow', state: 'Built in this local pilot', evidence: 'Route and contract tests' },
  { capability: 'Instrument simulator contract', state: 'Designed; exact adapter gated', evidence: 'Instrument workbench' },
  { capability: 'Personnel evidence workflow', state: 'Synthetic demonstration', evidence: 'Personnel route' },
  { capability: 'Authenticated customer access', state: 'Not implemented in this build', evidence: 'G-AUTH remains stopped' },
  { capability: 'UK production hosting', state: 'Not selected', evidence: 'Discovery and G-SPEND gates' },
  { capability: 'Customer data migration', state: 'Not authorized', evidence: 'G-PRODWRITE remains stopped' },
] as const;
