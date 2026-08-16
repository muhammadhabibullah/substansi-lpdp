/**
 * Next.js configuration — fully static export (no server at runtime).
 *
 * Hard constraint (AGENTS.md #1): `output: 'export'`, no API routes, no server
 * actions, no middleware. The build output in `out/` is deployable to GitHub
 * Pages as-is.
 *
 * `basePath`/`assetPrefix` are driven by the `NEXT_PUBLIC_BASE_PATH` env var so
 * the same source builds for both a user/org Pages site (root) and a project
 * Pages site (`/<repo>`). The Pages workflow sets it automatically.
 */

/*
 * Normalize whatever the deploy workflow passes in. Next requires a basePath
 * that starts with "/" and has no trailing slash; GitHub Pages reports "/" or
 * "" for a user/org site, both of which must become "no basePath".
 */
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').trim();
const normalizedBasePath = rawBasePath.replace(/\/+$/, '');
const basePath =
  normalizedBasePath === '' || normalizedBasePath === '/'
    ? ''
    : normalizedBasePath.startsWith('/')
      ? normalizedBasePath
      : `/${normalizedBasePath}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: {
    // No image optimization server exists in a static export.
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
