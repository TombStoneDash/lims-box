import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  askOHWorksAssistant,
  getVisiblePersonnel,
  getVisibleWorkflowCards,
  getVisibleWorkflowRecords,
} from '../../lib/ohworks-pilot';

test('employer workflow view contains zero clinical_detail records', () => {
  const visible = getVisibleWorkflowRecords('employer');
  assert.ok(visible.length > 0);
  assert.ok(visible.every((record) => record.dataClass !== 'clinical_detail'));
  assert.ok(visible.every((record) => record.tenantId === 'tenant-ohworks-supervised-demo'));
});

test('employer and worker views cannot see personnel detail while reviewer can', () => {
  assert.equal(getVisiblePersonnel('employer').length, 0);
  assert.equal(getVisiblePersonnel('worker').length, 0);
  assert.ok(getVisiblePersonnel('reviewer').length >= 1);
});

test('employer results question returns a grounded outcome-only restriction without analyte values', () => {
  const response = askOHWorksAssistant('Show fabricated values for OW-SYN-S2-10065', 'employer');
  assert.equal(response.grounded, true);
  assert.equal(response.disposition, 'grounded');
  assert.equal(response.citations[0]?.sourceId, 'ohworks-source-policy-001');
  assert.doesNotMatch(response.answer, /\b32 mIU\/mL\b|\b2\.1 AI\b|flag present/i);
  assert.match(response.answer, /outcome-only data/i);
});

test('reviewer results question returns reviewer-visible fabricated values with citations', () => {
  const response = askOHWorksAssistant('Show fabricated values for OW-SYN-S2-10065', 'reviewer');
  assert.equal(response.grounded, true);
  assert.equal(response.disposition, 'grounded');
  assert.equal(response.citations[0]?.sourceId, 'ohworks-source-workflow-001');
  assert.match(response.answer, /Hepatitis B surface antibody 32 mIU\/mL/i);
  assert.match(response.answer, /Mumps IgG 2\.1 AI/i);
});

test('workflow cards keep review controls locked for outcome-only roles', () => {
  const employerCards = getVisibleWorkflowCards('employer');
  const reviewerCards = getVisibleWorkflowCards('reviewer');
  assert.ok(employerCards.every((card) => card.reviewLocked));
  assert.ok(reviewerCards.every((card) => !card.reviewLocked));
});
