import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';

const detectedLanHosts = Object.values(networkInterfaces())
  .flatMap(addresses => addresses ?? [])
  .filter(address => address.family === 'IPv4' && !address.internal)
  .map(address => address.address);

const configuredLanHosts = (process.env.DEV_LAN_HOSTS || '')
  .split(',')
  .map(host => host.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: [...new Set([...detectedLanHosts, ...configuredLanHosts])],
};

export default nextConfig;
