/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow importing from workspace packages without transpiling twice.
    externalDir: true,
  },
  transpilePackages: ['@rfp-pulse/db', '@react-pdf-viewer/core', 'pdfjs-dist'],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    config.resolve.fallback = config.resolve.fallback ?? {};
    // pdfjs-dist can attempt to resolve the optional Node canvas binding in
    // non-browser bundles; disable it for this Next app.
    config.resolve.alias.canvas = false;
    config.resolve.fallback.canvas = false;
    return config;
  },
};

export default nextConfig;
