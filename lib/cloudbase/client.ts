'use client';

/**
 * 浏览器侧 CloudBase 工具。
 *
 * 浏览器不再直接调用 CloudBase 身份认证网关（免费体验版无法把带随机后缀的默认域名
 * 加入白名单，直连会被跨域检查拦掉）。登录/注册/会话校验全部走同源的 /api/auth，
 * 这里只负责：判定是否已配置 CloudBase、读写会话 token、给 /api/* 请求带上 Bearer。
 */

export const AUTH_TOKEN_KEY = 'wb-auth-token';
export const AUTH_USER_KEY = 'wb-auth-user';

let runtimeConfig: CloudBaseClientConfig | null = null;

export type CloudBaseClientConfig = {
  envId: string;
  region: string;
  publishableKey: string;
};

export function configureCloudBaseClient(config: CloudBaseClientConfig | null) {
  if (!config) return;
  runtimeConfig = config;
}

export function isCloudBaseClientConfigured() {
  return Boolean(runtimeConfig?.envId && runtimeConfig.publishableKey);
}

export function getStoredAccessToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
}

export function clearStoredSession() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  } catch { /* 隐私模式等场景忽略 */ }
}

export async function cloudBaseFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (!isCloudBaseClientConfigured()) return fetch(input, init);

  const accessToken = getStoredAccessToken();
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

  const response = await fetch(input, { ...init, headers });

  // token 失效：清空会话并通知认证门跳回登录页。
  if (response.status === 401 && accessToken) {
    clearStoredSession();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('wb-auth-expired'));
  }

  return response;
}
