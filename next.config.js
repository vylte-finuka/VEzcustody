/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Configuration pour le DON (Data Oracle Network) VEZ
  env: {
    NEXT_PUBLIC_SLURA_RPC_URL:
      process.env.NEXT_PUBLIC_SLURA_RPC_URL || process.env.SLURA_RPC_URL || "https://slu-charene.vyft-one.com",
    NEXT_PUBLIC_SLURA_CHAIN_ID: process.env.NEXT_PUBLIC_SLURA_CHAIN_ID || process.env.SLURA_CHAIN_ID || "45057",
    NEXT_PUBLIC_VEZ_PROXY_ADDRESS:
      process.env.NEXT_PUBLIC_VEZ_PROXY_ADDRESS || process.env.VEZ_PROXY_ADDRESS || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    NEXT_PUBLIC_AGGREGATOR_ADDRESS:
      process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS || process.env.AGGREGATOR_ADDRESS || "0xcccccccccccccccccccccccccccccccccccccccc",
    NEXT_PUBLIC_EAC_AGGREGATOR_ADDRESS:
      process.env.NEXT_PUBLIC_EAC_AGGREGATOR_ADDRESS || process.env.EAC_AGGREGATOR_ADDRESS || "0xdddddddddddddddddddddddddddddddddddddddd",
  },
};

module.exports = nextConfig;