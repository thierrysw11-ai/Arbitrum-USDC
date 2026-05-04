const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // 1. Bypass TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },

/**
   * Content-Security-Policy for a Web3 dApp.
   *
   * Permissive on script-src (`unsafe-eval`, `unsafe-inline`) because
   * WalletConnect / Reown SDK uses `Function()` constructor for protocol
   * message handling — every production Web3 dApp ships these for the
   * same reason. CSS-in-JS libraries (RainbowKit, Tailwind base) need
   * `unsafe-inline` for style-src.
   *
   * Other directives close the actual common XSS vectors:
   *   - `object-src 'none'` blocks <object> / <embed>
   *   - `base-uri 'self'` blocks injected <base> tags
   *   - `form-action 'self'` blocks form-action hijacks
   *   - `frame-ancestors 'none'` blocks clickjacking via iframe embedding
   *
   * `connect-src` opened to all HTTPS+WSS because the dApp talks to many
   * endpoints (wagmi RPC, Alchemy, The Graph gateways, Anthropic API, x402
   * facilitator, possibly Vercel preview URLs). Locking this down would
   * require maintaining an allowlist of every endpoint the app touches.
   */
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.walletconnect.com https://*.walletconnect.org",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.com https://secure.walletconnect.org",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // Companion hardening headers — also Lighthouse-positive.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
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