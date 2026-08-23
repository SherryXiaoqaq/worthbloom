'use client';

import cloudbase from '@cloudbase/js-sdk';

let cloudBaseApp: ReturnType<typeof cloudbase.init> | null = null;
let runtimeConfig: CloudBaseClientConfig | null = null;

export type CloudBaseClientConfig = {
  envId: string;
  region: string;
  publishableKey: string;
};

export function configureCloudBaseClient(config: CloudBaseClientConfig | null) {
  if (!config) return;
  if (runtimeConfig?.envId !== config.envId || runtimeConfig.publishableKey !== config.publishableKey) cloudBaseApp = null;
  runtimeConfig = config;
}

export function isCloudBaseClientConfigured() {
  return Boolean(runtimeConfig?.envId && runtimeConfig.publishableKey);
}

export function getCloudBaseClient() {
  if (!isCloudBaseClientConfigured()) {
    throw new Error('CloudBase 客户端尚未配置');
  }

  cloudBaseApp ??= cloudbase.init({
    env: runtimeConfig!.envId,
    region: runtimeConfig!.region || 'ap-shanghai',
    accessKey: runtimeConfig!.publishableKey,
    timeout: 15_000,
  });

  return cloudBaseApp;
}

export function getCloudBaseAuth() {
  return getCloudBaseClient().auth();
}

export async function getCloudBaseAccessToken() {
  if (!isCloudBaseClientConfigured()) return null;
  const { accessToken } = await getCloudBaseAuth().getAccessToken();
  return accessToken || null;
}

export async function cloudBaseFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (!isCloudBaseClientConfigured()) return fetch(input, init);

  const accessToken = await getCloudBaseAccessToken();
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}
