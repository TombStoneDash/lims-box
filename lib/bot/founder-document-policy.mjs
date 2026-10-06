import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Exact paths and both input/output hashes are reviewed together. Tags are
// evidence-library guidance, never automatic admission from a source directory.
export function parseFounderAllowlist(text) {
  const entries = [];
  const paths = new Set();
  const hashes = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [source, sha256, redactedSha256, tag, ...extra] = line.split('\t');
    if (extra.length || !source || !/^[a-zA-Z0-9_./ -]+$/.test(source)
      || source.split('/').some(part => !part || part === '.' || part === '..'
        || part.trim() !== part || part.endsWith('.') || part.toUpperCase() === '15_HT_FOUNDER_INTAKE')
      || !/^[a-f0-9]{64}$/.test(sha256 ?? '') || !/^[a-f0-9]{64}$/.test(redactedSha256 ?? '')
      || !['FOUNDER_STORY_SAFE', 'PUBLIC'].includes(tag)
      || paths.has(source.toLowerCase()) || hashes.has(sha256)) throw new Error('invalid_founder_allowlist');
    paths.add(source.toLowerCase());
    hashes.add(sha256);
    entries.push({ source, sha256, redactedSha256, tag });
  }
  return entries;
}

export function readConfinedFile(root, relative, maxBytes) {
  if (lstatSync(root).isSymbolicLink()) throw new Error('symlink');
  const resolvedRoot = realpathSync(root);
  let file = resolvedRoot;
  for (const component of relative.split('/')) {
    if (!component || component === '.' || component === '..' || /[\\:]/.test(component)) throw new Error('invalid_path');
    file = path.join(file, component);
    if (lstatSync(file).isSymbolicLink()) throw new Error('symlink');
  }
  if (!realpathSync(file).startsWith(resolvedRoot + path.sep)) throw new Error('outside_bundle');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('invalid_file');
    const bytes = readFileSync(fd);
    if (bytes.length > maxBytes) throw new Error('oversize');
    return bytes;
  } finally { closeSync(fd); }
}
