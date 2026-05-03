const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // 1. Bypass TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // 2. Bypass ESLint errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },

  webpack: (config) => {
    // Required by WalletConnect / wagmi
    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    // Fix `dom-helpers` pathing for react-transition-group
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'dom-helpers/addClass': path.resolve(
        __dirname,
        'node_modules/dom-helpers/cjs/addClass.js'
      ),
      'dom-helpers/removeClass': path.resolve(
        __dirname,
        'node_modules/dom-helpers/cjs/removeClass.js'
      ),
    };

    return config;
  },
};

module.exports = nextConfig;