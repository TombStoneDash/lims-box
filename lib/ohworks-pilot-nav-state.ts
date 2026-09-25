function stripTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}

export function isPilotNavActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  return stripTrailingSlash(pathname) === stripTrailingSlash(href);
}

export function roleChangeAnnouncement(roleLabel: string | undefined, pending: boolean): string {
  if (pending) return 'Updating view...';
  if (!roleLabel) return '';
  return `Showing the ${roleLabel} view.`;
}
