function stripTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizePathname(pathname: string): string {
  const withoutHash = pathname.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  return stripTrailingSlash(withoutQuery);
}

export function isSenaiteDemoNavCurrent(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;

  const normalizedPathname = normalizePathname(pathname);
  const normalizedHref = stripTrailingSlash(href);

  if (normalizedHref === '/senaite-demo') {
    return normalizedPathname === normalizedHref;
  }

  if (normalizedHref.startsWith('/senaite-demo/samples/')) {
    return normalizedPathname.startsWith('/senaite-demo/samples/');
  }

  return (
    normalizedPathname === normalizedHref ||
    normalizedPathname.startsWith(`${normalizedHref}/`)
  );
}
