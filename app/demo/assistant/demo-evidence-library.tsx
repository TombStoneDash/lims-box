import React from 'react';
import samplesJson from '@/data/synthetic/samples.json';
import resultsJson from '@/data/synthetic/results.json';
import testsJson from '@/data/synthetic/tests.json';

interface EvidenceSample {
  id: string;
  matrix: string;
  container: string;
  status: string;
  received_at: string;
  expected_report_at: string;
  test_codes: string[];
}

interface EvidenceResult {
  id: string;
  sample_id: string;
  test_code: string;
  analyte: string;
  value: number | null;
  flag: string;
  units: string;
  detection_limit: number;
}

interface EvidenceTest {
  code: string;
  name: string;
  discipline: string;
  valid_matrices: string[];
  turnaround_hours: number;
}

const evidenceSamples = samplesJson as EvidenceSample[];
const evidenceResults = resultsJson as EvidenceResult[];
const evidenceTests = testsJson as EvidenceTest[];

export function DemoEvidenceLibrary() {
  return (
    <section className="mt-8 space-y-4" aria-labelledby="synthetic-evidence-heading">
      <div>
        <h2 id="synthetic-evidence-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
          Synthetic evidence library
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Expand the exact fabricated sample or test cited by an answer. These records are committed demo
          fixtures, not patient, client, or production data.
        </p>
      </div>

      <div className="space-y-3">
        {evidenceSamples.map((sample) => {
          const sampleResults = evidenceResults.filter((result) => result.sample_id === sample.id);
          return (
            <details
              id={`synthetic-sample-${sample.id.toLowerCase()}`}
              key={sample.id}
              className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5"
            >
              <summary className="cursor-pointer font-semibold text-slate-900 dark:text-white">
                Synthetic sample {sample.id}
              </summary>
              <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-300">
                <div><dt className="font-medium">Status</dt><dd>{sample.status}</dd></div>
                <div><dt className="font-medium">Matrix / container</dt><dd>{sample.matrix} / {sample.container}</dd></div>
                <div><dt className="font-medium">Received</dt><dd>{sample.received_at}</dd></div>
                <div><dt className="font-medium">Expected report</dt><dd>{sample.expected_report_at}</dd></div>
                <div className="sm:col-span-2"><dt className="font-medium">Ordered tests</dt><dd>{sample.test_codes.join(', ')}</dd></div>
              </dl>

              <div id={`synthetic-results-${sample.id.toLowerCase()}`} className="mt-4 scroll-mt-6 border-t border-slate-200 pt-3 dark:border-white/10">
                <h3 className="font-medium text-slate-900 dark:text-white">Synthetic results for {sample.id}</h3>
                {sampleResults.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">No fabricated results recorded.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    {sampleResults.map((result) => (
                      <li key={result.id}>
                        {result.test_code} / {result.analyte}: {result.value === null ? `below detection (${result.detection_limit} ${result.units})` : `${result.value} ${result.units}`} — flag {result.flag}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {evidenceTests.map((test) => (
          <article
            id={`synthetic-test-${test.code.toLowerCase()}`}
            key={test.code}
            className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-white/10 dark:bg-white/5"
          >
            <h3 className="font-semibold text-slate-900 dark:text-white">Synthetic test {test.code}</h3>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              {test.name} · {test.discipline} · matrices {test.valid_matrices.join(', ')} · turnaround {test.turnaround_hours} hours
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
