/**
 * Blank worksheet content transcribed from the reviewed public customer edition:
 * public/personnel-pack-assets/iso-15189-personnel-pack-v1-5-customer-20260827.pdf
 * SHA-256: 6f58d8e865ca801575d7c6659b015fad72e6db7a786587b14b58e6deb6d8d0f0
 * No applicant, personnel, patient, or database record is accepted by this template.
 */
export const TEMPLATE_REVISION = 'iso15189-v1.5-worksheets-r1';
export const DOCUMENT_BOUNDARY = 'This is a blank documentation aid. It does not certify conformity or accreditation, determine personnel qualifications or competence, replace a licensed copy of ISO 15189:2022, or replace accreditation-body, legal, or laboratory-specific requirements.';
const CUSTOMIZE = 'Customize this form to your laboratory, roles, examinations, licensed standard, accreditor instructions, and local law.';
const EVIDENCE = [
  'Observed performance against the current procedure and assigned scope',
  'Review of generated records, results, calculations, or reports',
  'Review of quality, control, comparison, maintenance, or related evidence relevant to the role',
  'Response to nonconformities, exceptions, or problem-solving scenarios',
  'Knowledge or understanding evidence appropriate to the assigned activity',
  'Other laboratory-defined evidence linked to local competence criteria',
];

export interface Worksheet {
  title: string;
  description: string;
  fields?: string[];
  columns?: string[];
  rows?: string[];
  checks?: string[];
  notes?: string[];
}

export const WORKSHEETS: readonly Worksheet[] = [
  {
    title: '1. How to use this pack',
    description: 'Use these worksheets as a controlled starting point for personnel documentation. The laboratory remains responsible for deciding what applies, assigning authorised reviewers, protecting records, and retaining evidence.',
    checks: [
      'Make a working copy and assign a document owner before use.',
      'Map each form to your licensed ISO 15189:2022 copy, accreditation programme, local law, and laboratory policy.',
      'Replace generic fields with laboratory-specific roles, examinations, competence criteria, review cycles, retention periods, and approval authority.',
      'Use unique identifiers and version numbers. Never erase a superseded or revoked record; preserve history according to policy.',
      'Do not place patient identifiers in this pack unless your approved privacy and record-control workflow requires and protects them.',
      'A blank box is not evidence. Attach or reference the underlying observation, worksheet, quality record, maintenance record, examination challenge, training record, or other objective evidence.',
    ],
    notes: [
      'Responsibilities and records: Define roles, responsibilities, authorities, and the controlled evidence retained for each person.',
      'Competence and authorisation: Define role- and examination-specific competence criteria, evaluate evidence, record conclusions, and control the scope and status of authorisation.',
      'Education and development: Plan induction, training, continuing education, professional development, and reassessment appropriate to assigned work.',
      "Use the laboratory's licensed ISO 15189:2022 copy to verify exact requirements and clause applicability before adopting any form.",
    ],
  },
  {
    title: '2. Personnel file cover sheet',
    description: 'Create one controlled cover sheet for each personnel file. Use references to supporting documents rather than duplicating sensitive records.',
    fields: ['Laboratory / site', 'Personnel name', 'Personnel ID', 'Role / category', 'Department / section', 'Hire / assignment date', 'Supervisor', 'File owner', 'File review date', 'Next review due'],
    columns: ['File component', 'Reference', 'Verified by'],
    rows: ['Application / resume / CV', 'Education / transcript evidence', 'License(s), if applicable', 'Certification(s), if applicable', 'Current job description', 'Induction and initial training', 'Initial competence evidence', 'Ongoing competence evidence', 'Procedure authorisations', 'Continuing education / retraining', 'Restrictions / corrective actions', 'Other lab-required evidence'],
    notes: [CUSTOMIZE],
  },
  {
    title: '3. Role, qualification, and credential index',
    description: 'Define the local criteria for an assigned role, record what was reviewed, identify the authorised evaluator, and retain the evidence reference. This worksheet does not decide suitability for the laboratory.',
    fields: ['Personnel name / ID', 'Role / category evaluated', 'Role criteria / policy reference', 'Evaluator and authority', 'Evaluation date', 'Final determination', 'Conditions / limitations'],
    columns: ['Evidence type', 'Institution / issuer', 'Credential / degree', 'Issue date', 'Expiry', 'Document ID / location'],
    notes: ['Suitability decisions must be made by an authorised laboratory role using the licensed standard, local law, accreditor instructions, and laboratory policy.'],
  },
  {
    title: '4. Induction and training record',
    description: 'Document induction or planned training, the controlled source procedure, observed practice, outcome, and follow-up. Training completion is not the same as a competence determination.',
    fields: ['Personnel name / ID', 'Procedure / test system', 'Procedure document ID / version', 'Trainer and role', 'Training start date', 'Training completion date', 'Training summary / limitations', 'Next step / competence assessment due'],
    columns: ['Date', 'Training activity / topic', 'Method / evidence', 'Outcome / gap', 'Trainer initials'],
    notes: [CUSTOMIZE],
  },
  {
    title: '5. Procedure authorisation record',
    description: 'Record the scope and authority of a procedure-specific authorisation. Link it to the supporting competence evidence and preserve status and revocation history.',
    fields: ['Authorisation ID', 'Personnel name / ID', 'Role', 'Procedure / examination', 'Procedure document ID / version', 'Supporting competence record ID', 'Authorised scope / restrictions', 'Authorised date', 'Effective date', 'Review / expiry date', 'Authorised by / title', 'Approval signature / attestation reference', 'Revoked / changed date', 'Authority', 'Reason and replacement record'],
    checks: ['Status: Active', 'Status: Restricted', 'Status: Expired', 'Status: Revoked'],
    notes: ['Do not delete or overwrite prior authorisation states. Follow laboratory policy for authority, attestation, retention, restrictions, and reauthorisation.'],
  },
  {
    title: '6. Competence assessment plan',
    description: 'Define role- and examination-specific competence criteria and the objective evidence the authorised assessor will review. The laboratory sets methods and timing from its licensed standard, local requirements, risks, and policy.',
    fields: ['Personnel name / ID', 'Role / examination / procedure', 'Competence criteria document ID', 'Assessment cycle / trigger', 'Assigned assessor / authority', 'Planned completion date'],
    columns: ['Planned evidence category', 'Evidence / record ID', 'Due'],
    rows: EVIDENCE,
    checks: ['Criteria and acceptance thresholds are defined before assessment.', 'Assessor competence and authority are documented.', 'New or changed duties, methods, equipment, or risks are evaluated as reassessment triggers.', 'Restrictions and supervision remain visible until an authorised decision changes them.'],
    notes: ['This page intentionally does not prescribe universal assessment methods or intervals. Verify the local plan against the licensed ISO 15189:2022 standard and applicable requirements.'],
  },
  {
    title: '7. Competence evidence and result',
    description: "Document the evidence reviewed and the authorised assessor's conclusion against predefined local criteria. Do not infer an overall outcome from checked boxes alone.",
    fields: ['Assessment record ID', 'Personnel name / ID', 'Test system / procedure', 'Procedure version', 'Assessment period', 'Assessor / title / authority', 'Assessment date', 'Scope, restrictions, or gaps', 'Corrective action / follow-up record', 'Next assessment due', 'Assessor attestation / date', 'Director / authorised reviewer / date'],
    columns: ['Evidence category', 'Evidence ID / description', 'Result', 'Assessor initials'],
    rows: EVIDENCE,
    checks: ['Authorised conclusion: Competent within stated scope', 'Authorised conclusion: Additional evidence required', 'Authorised conclusion: Restricted / supervised', 'Authorised conclusion: Corrective action required'],
  },
  {
    title: '8. Corrective action and restriction follow-up',
    description: 'Connect a gap to an immediate control, corrective action, objective evidence, reassessment, and an authorised closure decision.',
    fields: ['Follow-up record ID', 'Related assessment / authorisation ID', 'Personnel name / ID', 'Procedure / examination', 'Gap / event identified', 'Immediate restriction / supervision', 'Root-cause review', 'Corrective action plan', 'Owner', 'Target date', 'Reassessment method', 'Reassessment date', 'Evidence reviewed', 'Outcome / remaining restriction', 'Closure authority / date'],
    notes: ["A restriction or suspended authorisation remains in effect until the laboratory's authorised decision-maker documents the change or closure."],
  },
  {
    title: '9. Continuing development and review calendar',
    description: 'Plan and reference continuing education, professional development, competence review, authorisation review, and other laboratory-defined personnel events. Calendar entries are reminders, not evidence that work occurred.',
    columns: ['Due date', 'Personnel', 'Development / review activity', 'Purpose / trigger', 'Owner', 'Completed / evidence ID'],
    checks: ['Overdue development and review events are assigned.', 'Changes in duties, methods, equipment, or risk are reviewed for reassessment needs.', 'Expiring credentials and authorisations are reviewed.', 'Restrictions and open corrective actions are reviewed.', 'Completion is reconciled to objective evidence IDs.'],
    notes: [CUSTOMIZE],
  },
  {
    title: '10. Document control register',
    description: 'Track the approved version, owner, location, review cycle, and status of every form or procedure used in the personnel process.',
    columns: ['Document ID', 'Title', 'Version', 'Effective', 'Owner', 'Approved by', 'Status / location'],
    fields: ['Version change record: Document ID', 'From version / To version', 'Change summary', 'Approved by / date', 'Superseded copy location'],
    notes: ["Use the laboratory's licensed ISO 15189:2022 copy, accreditor instructions, local law, and policy to define document-control and retention requirements."],
  },
  {
    title: '11. Personnel-process review trail',
    description: 'Record periodic checks of the process itself: completeness, overdue work, authorisation gaps, corrective-action closure, and record control.',
    fields: ['Review ID', 'Review date', 'Reviewer / independence', 'Scope / period covered', 'Sample / population', 'Criteria used', 'Overall conclusion', 'Open actions and next review', 'Reviewer attestation / date'],
    columns: ['Check performed', 'Evidence / sample', 'Finding', 'Action / owner / due'],
    notes: [CUSTOMIZE],
  },
  {
    title: '12. ISO 15189 personnel mapping worksheet',
    description: 'Complete this page from controlled, current sources. The pack uses high-level personnel categories and intentionally does not reproduce the licensed standard, prescribe universal criteria, or supply a universal retention schedule.',
    columns: ['Authority', 'Controlled source / edition', 'Requirement / purpose', 'Pack record', 'Gap / owner'],
    rows: ['ISO 15189:2022 section 6.2', 'Role criteria', 'Competence process', 'Authorisation process', 'Local law / rule', 'Accreditor guidance', 'Other controlled source'],
    notes: ['Licensed copy / accreditor: Personnel responsibilities, competence, authorisation, education and records.', 'Laboratory-controlled policy: Education, qualification, experience, competence and authority defined locally; criteria, evidence, assessor authority, conclusion and reassessment; scope, effective status, restrictions, review and revocation history.', 'If the controlled sources disagree or are unclear, stop and obtain a written interpretation from the applicable regulator or accreditor.'],
    checks: ['Every requirement claim is tied to a controlled source.', 'No obsolete ISO edition or clause numbering remains in active forms.', 'Roles and signatures match current laboratory authority.', 'Retention, privacy, and access controls are documented.', 'Blank, not-applicable, overdue, restricted, revoked, and missing-evidence states are distinguishable.', 'An independent reviewer checked the completed local customisation before use.'],
  },
  {
    title: '13. Sources, boundaries, and customer support',
    description: 'These links support the limited public claims in this customer edition. They do not substitute for the licensed ISO standard, accreditation-body instructions, local law, or laboratory-specific requirements.',
    notes: ['ISO 15189:2022 official record: https://www.iso.org/standard/76677.html', 'LIMS BOX Personnel Pack: https://lims.bot/personnel-pack', 'LIMS BOX demo: https://lims.bot/demo (synthetic demonstration; not production laboratory data).', 'LIMS BOX support: info@lims.bot', 'Printable blank worksheets for local customisation. This edition does not include interactive form fields and does not determine conformity, competence, qualification, or accreditation.', 'Prepared by LIMS BOX / Tombstone Dash LLC. Human review required. Confirm completeness against controlled requirements before laboratory, accreditation, employment, or quality-system use.'],
  },
];
