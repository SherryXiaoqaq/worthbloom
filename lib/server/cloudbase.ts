import 'server-only';

import cloudbase from '@cloudbase/js-sdk';

let authApp: ReturnType<typeof cloudbase.init> | null = null;
let dataApp: ReturnType<typeof cloudbase.init> | null = null;

export function isCloudBaseServerConfigured() {
  return Boolean(
    (process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID) &&
    process.env.CLOUDBASE_APIKEY,
  );
}

function createCloudBaseApp() {
  if (!isCloudBaseServerConfigured()) {
    throw new Error('CloudBase 服务端尚未配置');
  }

  return cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID,
    region: process.env.CLOUDBASE_REGION || process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai',
    accessKey: process.env.CLOUDBASE_APIKEY,
    timeout: 15_000,
  });
}

/**
 * 认证代理专用实例。login/register/verify 会把它的身份切换到“终端用户”，
 * 因此它绝不能用于数据库操作，否则会失去对“仅管理员可读写”集合的权限。
 */
export function getCloudBaseServer() {
  authApp ??= createCloudBaseApp();
  return authApp;
}

/**
 * 数据层专用实例。永远保持服务端身份（accessKey），绝不执行用户登录，
 * 确保对文档数据库的读写始终以管理员权限进行。
 */
export function getCloudBaseDb() {
  dataApp ??= createCloudBaseApp();
  return dataApp.database();
}
