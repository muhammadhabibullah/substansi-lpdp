/**
 * lib/site.ts — static site constants.
 *
 * `basePath` matters because the app may be served from a project Pages path
 * (`/<repo>`); `withBasePath` builds asset URLs that survive both layouts.
 * Next's `<Link>` handles route prefixes itself, so this is only for raw asset
 * paths (e.g. the pdf.js worker).
 */

/**
 * Normalized deployment base path, matching the logic in `next.config.mjs`.
 * Empty for a root deployment; `/repo` for a project Pages site.
 */
function normalizeBasePath(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export const BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? '');

export const SITE = {
  name: 'Substansi LPDP',
  repoUrl: 'https://github.com/muhammadhabibullah/substansi-lpdp',
  licenseUrl:
    'https://github.com/muhammadhabibullah/substansi-lpdp/blob/main/LICENSE',
  lpdpGuidanceUrl:
    'https://lpdp.kemenkeu.go.id/beasiswa/serba-serbi/ini-yang-perlu-disiapkan-untuk-hadapi-seleksi-substansi-lpdp',
} as const;

/** Prefix a root-relative asset path with the deployment base path. */
export function withBasePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
