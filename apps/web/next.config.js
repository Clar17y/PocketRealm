/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pocketrealm/shared', '@pocketrealm/game-engine'],
};

module.exports = nextConfig;
