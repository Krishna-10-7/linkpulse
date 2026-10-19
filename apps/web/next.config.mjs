// The dashboard is a static export served at <BASE_PATH>/app, next to the API and the short links.
const base = (process.env.NEXT_PUBLIC_BASE_PATH || '/lk').replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: `${base}/app`,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: base },
};

export default nextConfig;
