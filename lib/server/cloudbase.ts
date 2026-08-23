import 'server-only';

import cloudbase from '@cloudbase/js-sdk';

let cloudBaseApp: ReturnType<typeof cloudbase.init> | null = null;

export function isCloudBaseServerConfigured() {
  return Boolean(
    (process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID) &&
    process.env.CLOUDBASE_APIKEY,
  );
}

export function getCloudBaseServer() {
  if (!isCloudBaseServerConfigured()) {
    throw new Error('CloudBase 服务端尚未配置');
  }

  cloudBaseApp ??= cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID,
    region: process.env.CLOUDBASE_REGION || process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai',
    accessKey: process.env.CLOUDBASE_APIKEY,
    timeout: 15_000,
  });

  return cloudBaseApp;
}

export function getCloudBaseDb() {
  return getCloudBaseServer().database();
}
