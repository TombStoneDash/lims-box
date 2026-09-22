'use client';

import { allQCData, qcSummary } from '@/lib/demo-data';
import type { QCAnalyte } from '@/lib/demo-data';
import { evaluateAnalyteQC, evaluateQCSummary } from '@/lib/senaite-demo-qc';
import type { QCAnalyteEvaluation } from '@/lib/senaite-demo-qc';
import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import React, { useState } from 'react';

const STATUS_BADGE = {
  'in-range': { label: 'All in range', className: 'text-green-700 bg-green-50', Icon: CheckCircle2 },
  'out-of-range': { label: 'Out of range', className: 'text-red-700 bg-red-50', Icon: AlertTriangle },
  invalid: { label: 'Needs review', className: 'text-amber-700 bg-amber-50', Icon: AlertTriangle },
} as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function LeveyJenningsChart({ analyte, evaluation }: { analyte: QCAnalyte; evaluation: QCAnalyteEvaluation }) {
  const { runs, mean, sd, name, unit } = analyte;
  const badge = STATUS_BADGE[evaluation.status];
  const badgeLabel =
    evaluation.status === 'out-of-range'
      ? `${evaluation.outOfRangeCount} of ${evaluation.totalRuns} out of range`
      : badge.label;
  const chartSlug = slugify(`${name}-${analyte.controlLot}`);
  const titleId = `lj-chart-${chartSlug}-title`;
  const descId = `lj-chart-${chartSlug}-desc`;
  const chartDesc = `Levey-Jennings control chart for ${name}, control lot ${analyte.controlLot}, unit ${unit}, ${runs.length} runs. QC status: ${badgeLabel}.`;
  const min = mean - 3.5 * sd;
  const max = mean + 3.5 * sd;
  const range = max - min;

  // SVG dimensions
  const w = 900;
  const h = 220;
  const pad = { top: 20, right: 20, bottom: 30, left: 60 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const toX = (i: number) => pad.left + (i / (runs.length - 1)) * plotW;
  const toY = (val: number) => pad.top + ((max - val) / range) * plotH;

  // Build path
  const pathD = runs
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(r.result).toFixed(1)}`)
    .join(' ');

  // SD lines
  const sdLines = [-3, -2, -1, 0, 1, 2, 3].map(mult => ({
    y: toY(mean + mult * sd),
    label: mult === 0 ? `Mean (${mean})` : `${mult > 0 ? '+' : ''}${mult}SD`,
    dashed: Math.abs(mult) >= 2,
    color: Math.abs(mult) >= 3 ? '#ef4444' : Math.abs(mult) >= 2 ? '#f59e0b' : '#94a3b8',
  }));

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{name}</h3>
          <p className="text-xs text-slate-500">Control Lot: {analyte.controlLot} — Unit: {unit}</p>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${badge.className} px-2 py-1 rounded-full`}>
          <badge.Icon className="w-3 h-3" /> {badgeLabel}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ maxHeight: 220 }}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>Levey-Jennings control chart: {name}</title>
        <desc id={descId}>{chartDesc}</desc>
        {/* SD zone shading */}
        <rect x={pad.left} y={toY(mean + 2 * sd)} width={plotW} height={toY(mean - 2 * sd) - toY(mean + 2 * sd)} fill="#f0fdf4" />
        <rect x={pad.left} y={toY(mean + 3 * sd)} width={plotW} height={toY(mean + 2 * sd) - toY(mean + 3 * sd)} fill="#fefce8" />
        <rect x={pad.left} y={toY(mean - 2 * sd)} width={plotW} height={toY(mean - 3 * sd) - toY(mean - 2 * sd)} fill="#fefce8" />

        {/* SD lines */}
        {sdLines.map((line, i) => (
          <g key={i}>
            <line
              x1={pad.left} y1={line.y} x2={w - pad.right} y2={line.y}
              stroke={line.color} strokeWidth={line.dashed ? 1 : 1.5}
              strokeDasharray={line.dashed ? '4 4' : undefined}
            />
            <text x={pad.left - 4} y={line.y + 3} textAnchor="end" className="text-[9px]" fill={line.color}>
              {line.label}
            </text>
          </g>
        ))}

        {/* Data line */}
        <path d={pathD} fill="none" stroke="#2563eb" strokeWidth={1.5} />

        {/* Data points */}
        {runs.map((r, i) => (
          <circle key={i} cx={toX(i)} cy={toY(r.result)} r={2} fill="#2563eb" />
        ))}

        {/* X axis labels (every 15 days) */}
        {runs.filter((_, i) => i % 15 === 0).map((r, _, arr) => {
          const idx = runs.indexOf(r);
          return (
            <text key={r.date} x={toX(idx)} y={h - 5} textAnchor="middle" className="text-[9px]" fill="#94a3b8">
              {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </text>
          );
        })}
      </svg>
      <div className="flex gap-6 mt-2 text-xs text-slate-500">
        <span>Mean: {mean} {unit}</span>
        <span>SD: {sd} {unit}</span>
        <span>N: {runs.length} runs</span>
        <span>Period: Jan 14 – Apr 13, 2026</span>
      </div>
    </div>
  );
}

const BANNER_STYLE = {
  'in-range': { wrap: 'bg-green-50 border-green-200', icon: 'text-green-600', title: 'text-green-800', text: 'text-green-600' },
  'out-of-range': { wrap: 'bg-red-50 border-red-200', icon: 'text-red-600', title: 'text-red-800', text: 'text-red-600' },
  invalid: { wrap: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', title: 'text-amber-800', text: 'text-amber-600' },
} as const;

const BANNER_TITLE = {
  'in-range': 'QC Status: All analytes within acceptable limits',
  'out-of-range': 'QC Status: Out-of-range results detected',
  invalid: 'QC Status: Needs review — invalid QC data',
} as const;

export default function QCChartsPage() {
  const [selected, setSelected] = useState<string>('all');
  const filtered = selected === 'all' ? allQCData : allQCData.filter(a => a.name === selected);
  const evaluations = new Map(allQCData.map(a => [a.name, evaluateAnalyteQC(a)]));
  const summary = evaluateQCSummary(allQCData);
  const banner = BANNER_STYLE[summary.status];
  const passRate =
    summary.totalRuns > 0
      ? `${(((summary.totalRuns - summary.outOfRangeCount) / summary.totalRuns) * 100).toFixed(1)}%`
      : 'N/A';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">QC Control Charts</h1>
          <p className="text-sm text-slate-500 mt-1">Levey-Jennings plots — 90-day trending</p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="qc-analyte-filter" className="sr-only">
            Filter QC charts by analyte
          </label>
          <select
            id="qc-analyte-filter"
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
          >
            <option value="all">All Analytes</option>
            {allQCData.map(a => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary banner */}
      <div className={`${banner.wrap} border rounded-lg p-4 flex items-center gap-4`}>
        <TrendingUp className={`w-6 h-6 ${banner.icon}`} />
        <div>
          <p className={`text-sm font-medium ${banner.title}`}>
            {BANNER_TITLE[summary.status]}
          </p>
          <p className={`text-xs ${banner.text}`}>
            {summary.totalRuns} total QC runs — {passRate} pass rate — {summary.outOfRangeCount} out-of-range flags — Control lots: {qcSummary.controlLots.join(', ')}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="space-y-4">
        {filtered.map(analyte => (
          <LeveyJenningsChart key={analyte.name} analyte={analyte} evaluation={evaluations.get(analyte.name)!} />
        ))}
      </div>
    </div>
  );
}
