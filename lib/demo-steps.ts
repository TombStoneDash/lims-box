/** Accessible label for a zero-based index in the three-step demo. */
export function stepTabLabel(index: number, label: string, isCurrent: boolean): string {
  return `Step ${index + 1} of 3: ${label.trim()}${isCurrent ? ' (current)' : ''}`;
}
