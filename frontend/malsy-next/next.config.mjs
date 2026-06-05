/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large video buffers in API route handlers
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
    responseLimit: false,
  },
  // Experimental: allow fs-extra in server components/routes
  serverExternalPackages: ['fs-extra'],
};

export default nextConfig;
