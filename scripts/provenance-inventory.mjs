#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { classifyFile } from './lib/provenance-classifier.mjs';

const usage = 'Usage: node scripts/provenance-inventory.mjs <folder> [--out report.json]';
const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--') || ![1, 3].includes(args.length) || (args.length === 3 && (args[1] !== '--out' || !args[2] || args[2].startsWith('--')))) {
  console.error(usage);
  process.exit(1);
}

const root = path.resolve(args[0]);
const files = [];
const summary = { low: 0, medium: 0, high: 0, unknown: 0 };

function sample(filePath) {
  let fd;
  let sizeBytes = null;
  try {
    const metadata = fs.lstatSync(filePath);
    if (!metadata.isFile()) return { sizeBytes, firstLineText: null };
    sizeBytes = metadata.size;
    // O_NOFOLLOW rejects file symlinks, including replacement after readdir.
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return { sizeBytes, firstLineText: null };
    sizeBytes = stat.size;
    const buffer = Buffer.alloc(200);
    const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
    // Streaming decode tolerates a multibyte character cut by the 200-byte cap.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count), { stream: count === 200 });
    const firstLineText = text.split(/\r\n|\r|\n/, 1)[0];
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(firstLineText)) return { sizeBytes, firstLineText: null };
    return { sizeBytes, firstLineText };
  } catch {
    return { sizeBytes, firstLineText: null };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function walk(directory) {
  // Refuse symlink directories, including a symlink supplied as the root.
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Invalid directory');
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filePath);
    else if (entry.isFile()) {
      const relPath = path.relative(root, filePath).split(path.sep).join('/');
      const { sizeBytes, firstLineText } = sample(filePath);
      const classification = classifyFile({ relPath, ext: path.extname(entry.name), sizeBytes, firstLineText });
      files.push({ relPath, sizeBytes, ...classification });
      summary[classification.riskLevel]++;
    }
  }
}

try {
  walk(root);
  const report = `${JSON.stringify({ files, summary }, null, 2)}\n`;
  // Exclusive creation protects input files and existing reports from overwrite.
  if (args.length === 3) fs.writeFileSync(path.resolve(args[2]), report, { flag: 'wx' });
  else process.stdout.write(report);
} catch {
  // Never include raw OS errors or sampled text in diagnostics.
  console.error('Inventory failed: folder must be a readable non-symlink directory; output must be a new writable file.');
  process.exitCode = 1;
}
