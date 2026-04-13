'use client';

import { allQCData, qcSummary } from '@/lib/demo-data';
import type { QCAnalyte } from '@/lib/demo-data';
import { CheckCircle2, TrendingUp } from 'lucide-react';
import { useState } from 'react';

function LeveyJenningsChart({ analyte }: { analyte: QCAnalyte }) {
  const { runs, mean, sd, name, unit } = analyte;
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
        <div className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
          <CheckCircle2 className="w-3 h-3" /> All in range
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 220 }}>
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
              {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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

export default function QCChartsPage() {
  const [selected, setSelected] = useState<string>('all');
  const filtered = selected === 'all' ? allQCData : allQCData.filter(a => a.name === selected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">QC Control Charts</h1>
          <p className="text-sm text-slate-500 mt-1">Levey-Jennings plots — 90-day trending</p>
        </div>
        <div className="flex items-center gap-3">
          <select
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
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-4">
        <TrendingUp className="w-6 h-6 text-green-600" />
        <div>
          <p className="text-sm font-medium text-green-800">
            QC Status: All analytes within acceptable limits
          </p>
          <p className="text-xs text-green-600">
            {qcSummary.totalRuns} total QC runs — {qcSummary.passRate} pass rate — 0 out-of-range flags — Control lots: {qcSummary.controlLots.join(', ')}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="space-y-4">
        {filtered.map(analyte => (
          <LeveyJenningsChart key={analyte.name} analyte={analyte} />
        ))}
      </div>
    </div>
  );
}
