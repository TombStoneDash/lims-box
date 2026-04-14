import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'overlays');
mkdirSync(outDir, { recursive: true });

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const cards = [
  { file: 'audit-tomorrow', line1: 'Audit tomorrow.', line2: 'Data in four places.' },
  { file: 'ready-in-minutes', line1: 'THE LIMS BOX.', line2: 'Ready in minutes.' },
  { file: 'every-sample', line1: 'Every sample.', line2: 'Tracked.' },
  { file: 'every-action', line1: 'Every action.', line2: 'Logged.' },
  { file: 'every-record', line1: 'Every record.', line2: 'Ready.' },
  { file: 'ask-plain-english', line1: 'Ask in plain English.', line2: null },
  { file: 'enterprise-grade', line1: 'Enterprise-grade', line2: 'traceability.' },
  { file: 'no-overhead', line1: 'No enterprise', line2: 'overhead.' },
  { file: 'offline-capable', line1: 'Offline-capable.', line2: 'Audit-ready.' },
  { file: 'right-sized', line1: 'Right-sized', line2: 'for regulated labs.' },
  { file: 'early-adopter-cta', line1: 'Apply for the', line2: 'early-adopter program.' },
  { file: 'contact', line1: 'info@lims.bot', line2: 'lims.bot' },
  { file: 'title-card', line1: 'THE LIMS BOX', line2: 'Lab management that fits your lab.', isTitle: true },
  { file: 'cap-ready', line1: 'CAP-ready', line2: 'traceability.' },
  { file: 'forensics-hook', line1: 'One missing handoff', line2: 'can break the case.' },
  { file: 'research-hook', line1: 'Too many samples.', line2: 'Too many systems.' },
];

const sizes = [
  { w: 3840, h: 2160, suffix: '-4k' },
  { w: 1920, h: 1080, suffix: '' },
];

let count = 0;
for (const card of cards) {
  for (const { w, h, suffix } of sizes) {
    const scale = w / 1920;
    const line1Size = card.isTitle ? 96 * scale : 72 * scale;
    const line2Size = card.isTitle ? 40 * scale : 64 * scale;
    const lineGap = card.isTitle ? 70 * scale : 90 * scale;
    const accentW = 80 * scale;
    const accentH = 6 * scale;

    const centerY = h / 2;
    const line1Y = card.line2 ? centerY - lineGap / 2 + line1Size * 0.35 : centerY + line1Size * 0.35;
    const line2Y = centerY + lineGap / 2 + line2Size * 0.35;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#1E3A5F"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)" opacity="0.88"/>
  <rect x="${(w - accentW) / 2}" y="${centerY - (card.line2 ? lineGap : 0) - line1Size * 0.8}" width="${accentW}" height="${accentH}" rx="${accentH / 2}" fill="#2E8B57"/>
  <text x="${w / 2}" y="${line1Y}" text-anchor="middle" fill="white" font-family="'Inter',system-ui,sans-serif" font-weight="${card.isTitle ? '800' : '700'}" font-size="${line1Size}" letter-spacing="${card.isTitle ? '-2' : '-1'}">${escXml(card.line1)}</text>${card.line2 ? `
  <text x="${w / 2}" y="${line2Y}" text-anchor="middle" fill="${card.isTitle ? '#94a3b8' : 'white'}" font-family="'Inter',system-ui,sans-serif" font-weight="${card.isTitle ? '400' : '600'}" font-size="${line2Size}" letter-spacing="-0.5">${escXml(card.line2)}</text>` : ''}
</svg>`;

    writeFileSync(join(outDir, `${card.file}${suffix}.svg`), svg);
    count++;
  }
}

console.log(`Generated ${count} SVG files in public/overlays/`);
