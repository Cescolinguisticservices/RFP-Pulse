/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow importing from workspace packages without transpiling twice.
    externalDir: true,
  },
  transpilePackages: ['@rfp-pulse/db'],
};

export default nextConfig;
