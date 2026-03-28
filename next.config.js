// next.config.js
const path = require('path');
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@node-rs/argon2', 'sharp']
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['@'] = path.resolve(__dirname);
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('@node-rs/argon2');
      config.externals.push('sharp');
    }
    return config;
  }
};
module.exports = nextConfig;
