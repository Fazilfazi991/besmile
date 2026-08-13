import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PDFKit loads its font metric assets at runtime. Keeping it external prevents
  // the Next.js server bundler from separating those assets from the package.
  serverExternalPackages: ['pdfkit'],
};

export default nextConfig;
