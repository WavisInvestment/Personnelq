/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // The icon and chart libraries export hundreds of modules from one file. Without this, development compiles all of them
  // for every page (10,000+ modules, 30 seconds a page); with it, only the icons a page uses.
  experimental: {
    optimizePackageImports: ['@phosphor-icons/react', '@phosphor-icons/react/dist/ssr', 'recharts'],
  },
  images: {
    unoptimized: true,
  },
  // NEXT_PUBLIC_API_URL is optional: when unset, the browser derives the API address from the page's host
  // (see src/lib/api-url.ts), which is what lets a phone on the same Wi-Fi reach the API.
};

module.exports = nextConfig;
