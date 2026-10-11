// Planning evidence only: asserts observed defects, not corrected behavior.
import assert from 'node:assert/strict';
import { runAccessionWorkflow } from '../../lib/ohworks-accession-workflow';
import { applyVolumeLedgerEvents } from '../../lib/ohworks-volume-ledger';
import { evaluatePeerGroupComparison } from '../../lib/ohworks-peer-group-qc-comparison';
import { serializeOHWorksAuditCsv } from '../../lib/ohworks-audit-export';
import { evaluateMeasurementUncertainty } from '../../lib/ohworks-measurement-uncertainty';
import { evaluateLinearityVerification } from '../../lib/ohworks-linearity';

const accession = runAccessionWorkflow({tenantId:'synthetic',sampleId:'synthetic'}, [{eventId:'e1',tenantId:'synthetic',sampleId:'synthetic',kind:'receive',actorClass:'submitter',reasonCode:'sample-intake-logged',occurredAt:'2026-02-30T12:00:00Z'}]);
assert.equal(accession.blocked, false);
console.log('1 impossible accession date accepted:', accession.finalState);

const ledger = applyVolumeLedgerEvents({specimen:{accessionId:'synthetic',initialVolume:0.3,deadVolume:0},events:[0.1,0.2].map((amount,i)=>({entryType:'CONSUMPTION',eventId:`e${i}`,kind:'TEST_RUN',amount,timestamp:i}))});
assert.equal(ledger.status, 'INVALID');
console.log('2 exact decimal volume rejected:', JSON.stringify(ledger));

const peer = evaluatePeerGroupComparison({labResult:100,analyte:'synthetic',methodCode:'synthetic',peerGroupMean:100,peerGroupStdDev:Infinity,peerGroupN:30,minPeerGroupN:10});
assert.equal(peer.classification, 'acceptable');
console.log('3 infinite peer SD accepted:', JSON.stringify(peer));

const events = ['2026-01-01T00:00:00Z','2026-01-01T00:00:00.100Z'].map((at,i)=>({id:`e${i}`,at,actorId:'synthetic',action:'synthetic',object:'synthetic',note:'synthetic',tenantId:'synthetic',dataClass:'SYNTHETIC' as any}));
const rows = serializeOHWorksAuditCsv(events).trimEnd().split('\r\n').slice(1);
assert.ok(rows[0].startsWith('e1,'));
console.log('4 audit CSV later instant first:', rows.map(row=>row.split(',')[0]).join(','));

const uncertainty = evaluateMeasurementUncertainty({levelId:'synthetic',unit:'synthetic-unit',minimumPointCount:2,coverageFactor:2,points:[{value:1e-10,unit:'synthetic-unit'},{value:1e-10,unit:'synthetic-unit'}]}, {value:1e-10,unit:'synthetic-unit'}, {value:5e-10,unit:'synthetic-unit'});
assert.equal(uncertainty.decisionLimitCrossing?.crossesInterval,true);
assert.equal(uncertainty.patientInterval?.lowerBound,1e-10);
assert.equal(uncertainty.patientInterval?.upperBound,1e-10);
console.log('5 disjoint limit called crossing:', JSON.stringify(uncertainty.patientInterval), JSON.stringify(uncertainty.decisionLimitCrossing));

const linearity = evaluateLinearityVerification([1,2,3,4,5].map((n)=>({levelId:`l${n}`,expected:n*1e-8,observed:n*1e-8+5e-10})), {slopeMin:0.9,slopeMax:1.1,interceptMin:0,interceptMax:1e-10,correlationMin:0.99,recoveryMinPercent:90,recoveryMaxPercent:110});
assert.equal(linearity.decision,'pass');
assert.ok(linearity.intercept! > 4e-10);
console.log('6 fivefold intercept limit violation passed:', linearity.intercept, linearity.decision);
console.log('Verified all six current defects.');
