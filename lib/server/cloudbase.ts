import 'server-only';

import cloudbase from '@cloudbase/js-sdk';

let authApp: ReturnType<typeof cloudbase.init> | null = null;

export function isCloudBaseServerConfigured() {
  return Boolean(
    (process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID) &&
    process.env.CLOUDBASE_APIKEY,
  );
}

/**
 * 认证代理专用实例。只负责邮箱验证码登录/注册/验证，绝不用于数据库操作。
 *
 * 数据层已绕开 js-sdk，改用纯 HTTP（见 cloudbase-http-db.ts）：
 * 原因是 js-sdk 在同一个 Node 进程里所有 init() 实例共享同一份模块级
 * localStorage，登录后用户会话会污染数据实例，导致对“仅管理员可读写”的
 * 集合失去权限（读取返回空、写入静默失败）。因此本文件只保留认证实例。
 */
export function getCloudBaseServer() {
  authApp ??= cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID,
    region: process.env.CLOUDBASE_REGION || process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai',
    accessKey: process.env.CLOUDBASE_APIKEY,
    timeout: 15_000,
  });
  return authApp;
}
