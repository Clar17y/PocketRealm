/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@adventure/shared', '@adventure/game-engine'],
};

module.exports = nextConfig;
