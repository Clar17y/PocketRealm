/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pocketrealm/shared', '@pocketrealm/game-engine'],
  images: {
    minimumCacheTTL: 2592000, // 30 days — static icons never change
  },
};

module.exports = nextConfig;
