// LIMS BOT approved corpus.
// Every answer the bot gives is verbatim text from these entries, and every
// entry mirrors copy that is published on lims.bot (source = site path).
// Do NOT add claims that are not published on the site.
// Locked brand rule — forbidden phrasings anywhere in bot output:
// Never state that the software itself holds regulatory compliance,
// compatibility, certification, or clearance.

export interface CorpusEntry {
  id: string;
  title: string;
  source: string;
  keywords: string[];
  text: string;
}

// Locked compliance positioning (verbatim, never paraphrase):
export const COMPLIANCE_POSITIONING =
  'Offline-capable LIMS designed to support laboratory workflows under CLIA, HIPAA, ISO 15189, and 21 CFR Part 11 — with human-controlled AI assistance and customer-specific validation.';

export const corpus: CorpusEntry[] = [
  {
    id: 'what-is-lims-box',
    title: 'What is LIMS BOX?',
    source: '/',
    keywords: ['what', 'about', 'product', 'overview', 'limsbox', 'explain'],
    text: "The LIMS that doesn't need an IT department. Lab management for labs that build and grow on real samples. Offline-capable. Built for survey readiness. Optional AI assistance.",
  },
  {
    id: 'what-is-lims-bot',
    title: 'What is LIMS BOT?',
    source: '/bot',
    keywords: ['bot', 'assistant', 'prototype', 'questions', 'answers', 'documentation'],
    text: 'LIMS BOT is a prototype. It only answers from published LIMS BOX documentation and never stores your questions.',
  },
  {
    id: 'sample-tracking-overview',
    title: 'What does LIMS BOX track?',
    source: '/commercial',
    keywords: ['sample', 'samples', 'track', 'tracked', 'tracking', 'action', 'actions', 'logged', 'record', 'records'],
    text: 'Every sample tracked. Every action logged. Every record survey-ready.',
  },
  {
    id: 'setup-time',
    title: 'How long does it take to set up LIMS BOX?',
    source: '/faq',
    keywords: ['setup', 'set', 'up', 'install', 'implementation', 'long', 'time', 'days', 'onboarding', 'start', 'quickly'],
    text: 'Most labs are operational within 5-10 business days. That includes importing your sample types, configuring analytical methods, setting up user accounts, and a training session for your team. There is no 12-18 month implementation like enterprise LIMS platforms.',
  },
  {
    id: 'data-migration',
    title: 'Can we migrate data from our existing spreadsheets?',
    source: '/faq',
    keywords: ['migrate', 'migration', 'import', 'spreadsheet', 'spreadsheets', 'excel', 'csv', 'existing', 'data', 'historical'],
    text: "Yes. We provide a data migration tool that imports sample records, client lists, and method configurations from Excel and CSV files. Historical data can be imported as archived records so you don't lose your audit trail.",
  },
  {
    id: 'it-staff',
    title: 'Do we need dedicated IT staff to run LIMS BOX?',
    source: '/faq',
    keywords: ['it', 'staff', 'department', 'server', 'maintenance', 'technical', 'admin', 'sysadmin'],
    text: "No. LIMS BOX is designed for labs that share one IT person with the rest of the company — or don't have one at all. The Pelican case deployment runs on a Mac Studio that requires minimal maintenance. Cloud-hosted options require zero server management.",
  },
  {
    id: 'pricing',
    title: 'What does LIMS BOX cost?',
    source: '/faq',
    keywords: ['cost', 'price', 'pricing', 'month', 'monthly', 'plan', 'plans', 'fee', 'contract', 'pay', 'expensive', 'cheap', 'budget'],
    text: 'Plans start at $500/month for up to 3 users. The Growth plan at $1,200/month supports up to 10 users with advanced reporting. Instrument integration is planned and not built yet. No implementation fee, no long-term contract, cancel anytime. See our pricing page for full details.',
  },
  {
    id: 'pilot-program',
    title: 'Is there a free trial or pilot program?',
    source: '/faq',
    keywords: ['trial', 'free', 'pilot', 'program', 'try', 'test', 'evaluate', 'demo', '30-day'],
    text: "We offer a 30-day pilot program for qualifying labs. You get a fully configured system with your actual methods and sample types, dedicated onboarding support, and the option to walk away with no obligation if it doesn't fit.",
  },
  {
    id: 'cancel-data',
    title: 'What happens to our data if we cancel?',
    source: '/faq',
    keywords: ['cancel', 'cancellation', 'export', 'leave', 'quit', 'ownership', 'backups', 'retention'],
    text: 'Your data is always yours. On cancellation, we provide a full export of all sample records, results, QC data, and audit trails in standard formats (CSV, JSON, PDF). We retain backups for 90 days after cancellation, then permanently delete.',
  },
  {
    id: 'iso-17025',
    title: 'Is LIMS BOX ISO 17025 compliant?',
    source: '/faq',
    keywords: ['iso', '17025', 'accreditation', 'accredited', 'quality', 'qms'],
    text: 'LIMS BOX provides the technical controls that ISO 17025 requires: audit trails, sample traceability, QC enforcement, document control, and analyst competency tracking. Your lab still needs a quality management system and documented procedures, but the software infrastructure is ready for accreditation.',
  },
  {
    id: 'part-11',
    title: 'Does LIMS BOX meet 21 CFR Part 11 requirements?',
    source: '/faq',
    keywords: ['cfr', '21', 'signatures', 'electronic', 'signature', 'alcoa', 'integrity', 'validation'],
    text: 'LIMS BOX provides the technical controls 21 CFR Part 11 requires: immutable audit trails, electronic signatures with password authentication, role-based access controls, and data integrity enforcement (ALCOA+). We also provide validation documentation templates to support your IQ/OQ/PQ effort — but Part 11 compliance itself is your lab\'s own validation determination, not a certification LIMS BOX holds.',
  },
  {
    id: 'chain-of-custody',
    title: 'How does LIMS BOX handle chain of custody?',
    source: '/faq',
    keywords: ['chain', 'custody', 'coc', 'transfer', 'barcode', 'receipt', 'tracking', 'handoff'],
    text: 'Digital chain of custody from sample receipt through disposal. Every custody transfer is signed electronically with a timestamp and user ID. Temperature logging at receipt, barcode scanning for sample login, and a complete audit trail for every handoff. The record is generated automatically — no paper forms to lose.',
  },
  {
    id: 'methods',
    title: 'What methods does LIMS BOX support out of the box?',
    source: '/faq',
    keywords: ['methods', 'epa', 'templates', 'icp-ms', 'gc-ms', 'voc', 'metals', 'anions', 'colilert', 'method'],
    text: 'Pre-configured templates for common EPA methods including 200.8 (metals by ICP-MS), 524.2 (VOCs by GC-MS), 300.0 (anions by IC), 365.1 (phosphorus), SM 9223B (Colilert), and more. Custom methods can be configured by your lab manager without vendor assistance.',
  },
  {
    id: 'instruments',
    title: 'Can LIMS BOX integrate with our instruments?',
    source: '/faq',
    keywords: ['instrument', 'instruments', 'integration', 'integrate', 'connect', 'uv-vis', 'ic', 'analyzer', 'interface'],
    text: 'Not yet as a general feature. Today there is a CSV reader for one analyzer, used in testing only. Importing results from other instruments and file formats is planned. Tell us which instruments you run and we will say what that would take.',
  },
  {
    id: 'offline',
    title: 'Does LIMS BOX work offline?',
    source: '/faq',
    keywords: ['offline', 'internet', 'connectivity', 'rural', 'field', 'local', 'network', 'wifi', 'down', 'outage'],
    text: 'The Pelican case deployment runs entirely on local hardware — a Mac Studio inside a ruggedized case. No internet required for core LIMS operations. This is critical for rural labs, field deployments, and facilities with unreliable connectivity. Cloud sync happens when connectivity is available.',
  },
  {
    id: 'senaite',
    title: 'What is SENAITE and why does LIMS BOX use it?',
    source: '/faq',
    keywords: ['senaite', 'open-source', 'open', 'source', 'ridingbytes', 'platform', 'core'],
    text: 'SENAITE is an open-source, enterprise-grade LIMS built by RidingBytes in Germany. It powers accredited labs worldwide and is the most capable open-source LIMS available. LIMS BOX packages SENAITE into a turnkey deployment with pre-configured environmental testing workflows, simplified onboarding, and the voice interface.',
  },
  {
    id: 'support',
    title: 'What kind of support is included?',
    source: '/faq',
    keywords: ['support', 'help', 'phone', 'email', 'sla', 'response', 'account', 'manager', 'training'],
    text: 'Starter plan: email support with next-business-day response. Growth plan: priority email and phone support, dedicated onboarding specialist, and quarterly check-in calls. Enterprise: dedicated account manager, SLA with 4-hour response time, on-site training available.',
  },
  {
    id: 'talk-to-person',
    title: 'Can we talk to a real person before buying?',
    source: '/faq',
    keywords: ['talk', 'person', 'human', 'call', 'contact', 'founder', 'consultation', 'reach', 'speak'],
    text: 'Absolutely. Schedule a live demo webinar or request a 1-on-1 call. Our founder has 15 years of LIMS implementation experience and personally handles early adopter consultations. Email info@lims.bot or call (858) 305-8744.',
  },
  {
    id: 'compliance-positioning',
    title: 'LIMS BOX compliance positioning',
    source: '/compliance',
    keywords: ['clia', 'hipaa', 'compliance', 'compliant', 'certified', 'regulatory', 'regulated', '15189', 'audit-ready', 'fda'],
    text: COMPLIANCE_POSITIONING,
  },
  {
    id: 'early-access',
    title: 'How do I apply for early access?',
    source: '/early-adopter',
    keywords: ['apply', 'early', 'access', 'adopter', 'application', 'signup', 'join', 'waitlist'],
    text: 'We review every application personally and will contact you after review.',
  },
  {
    id: 'personnel-pack',
    title: 'What is the Personnel Pack?',
    source: '/personnel-pack',
    keywords: ['personnel', 'pack', 'competency', 'assessments', 'qualifications', 'training', 'documentation', 'procedures'],
    text: "Personnel Pack documents personnel competency for both CLIA §493.1407 and ISO 15189 clause 6.2.2 — the two frameworks US labs are increasingly required to satisfy simultaneously.",
  },
  {
    id: 'clia-tracker',
    title: 'What is the CLIA Tracker?',
    source: '/clia-tracker',
    keywords: ['clia', 'tracker', 'inspection', 'technologist', 'certifications', 'authorization', 'assessments', 'credential'],
    text: "LIMS BOX organizes certifications, competency assessments, training events, and procedure authorization — with a full audit trail — so you stop doing that inspection sprint and start answering confidently.",
  },
  {
    id: 'survey-ready-export',
    title: 'What is Survey-Ready Export?',
    source: '/survey-ready-export',
    keywords: ['survey', 'survey-ready', 'export', 'packet', 'folder', 'inspector', 'authorizations', 'review'],
    text: "LIMS BOX generates a complete personnel compliance packet — competency assessments, training history, certifications, and authorizations — formatted for CLIA and ISO 15189 survey review. One click. Ready in seconds.",
  },
  {
    id: 'roi-calculator',
    title: 'What is the ROI Calculator?',
    source: '/roi-calculator',
    keywords: ['roi', 'calculator', 'savings', 'saving', 'calculate', 'money', 'manual', 'benchmark'],
    text: "Enter your lab's details and see how much time and money you could save with LIMS BOX. Estimates based on industry benchmarks. Actual savings vary by lab.",
  },
];
