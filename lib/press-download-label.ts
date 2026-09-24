export function pressDownloadLabel(name: string, file: string): string {
  const trimmedName = name.trim();
  const lastDot = file.lastIndexOf('.');
  const lastSlash = file.lastIndexOf('/');

  if (lastDot <= lastSlash || lastDot === file.length - 1) {
    return `Download ${trimmedName}`;
  }

  const extension = file.slice(lastDot + 1).toUpperCase();
  return `Download ${trimmedName} (${extension})`;
}
