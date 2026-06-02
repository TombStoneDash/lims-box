/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Precautionary: old short slug → full slug (backward compat for external bookmarks/shares)
      {
        source: '/blog/clia-tracker',
        destination: '/blog/clia-tracker-three-times-with-ai',
        permanent: true,
      },
    ];
  },
  reactStrictMode: true,
  serverExternalPackages: ['pdfkit'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },
};

module.exports = nextConfig;
