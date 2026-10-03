export function toneLabel(tone: 'yes' | 'no' | 'partial'): 'Yes' | 'No' | 'Partial' {
  if (tone === 'yes') return 'Yes';
  if (tone === 'no') return 'No';
  return 'Partial';
}
