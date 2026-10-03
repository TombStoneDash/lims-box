export const COMMERCIAL_VIDEO_ID = '';

export function resolveCommercialVideoId(raw: string | undefined | null): string | null {
  if (!raw || raw.length !== 11 || raw === 'dQw4w9WgXcQ' || !/^[A-Za-z0-9_-]{11}$/.test(raw)) {
    return null;
  }
  return raw;
}
