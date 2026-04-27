const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Required by WalletConnect / wagmi
    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    // Fix `dom-helpers/addClass` + `dom-helpers/removeClass` subpath imports
    // used by react-transition-group. In dom-helpers@5 these live under
    // `cjs/` — the bare subpath is no longer exposed at the package root.
    // Pin the resolve so recharts's chart-animation chain compiles cleanly.
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
