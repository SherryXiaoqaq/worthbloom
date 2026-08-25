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

/**
 * 每块独立的本地存储。
 *
 * 关键背景：@cloudbase/js-sdk 在同一个 Node 进程里，所有 cloudbase.init() 实例
 * 默认共享同一份模块级 localStorage。一旦 authApp 完成了用户登录，用户会话会被
 * 写进这份共享存储；紧接着 dataApp 发起的数据库请求会顶替掉服务端身份，从而对
 * “仅管理员/服务端可读写”的集合失去权限——读取返回空、写入静默失败。这就是线上
 * “创建的心愿刷新后消失 / 邀请链接 404”的根因（云托管实例回收后会暂时恢复，所以
 * 表现成偶发）。
 *
 * 这里给每个实例一块独立的存储，让认证登录态与数据库服务端凭证彻底隔离：
 *  - authApp：登录/注册/验证码会话只写进它自己这块存储，绝不污染共享存储；
 *  - dataApp：始终只持有 accessKey 换来的服务端凭证，任何时刻都是管理员身份。
 */
function createIsolatedStorage() {
  const store = new Map<string, string>();
  return {
    type: 'custom' as const,
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? String(store.get(key)) : null;
      },
      setItem(key: string, value: string) {
        store.set(key, String(value));
      },
      removeItem(key: string) {
        store.delete(key);
      },
    },
  };
}

type CloudBaseInitConfig = Parameters<typeof cloudbase.init>[0] & {
  adapter: ReturnType<typeof createIsolatedStorage>;
};

function createCloudBaseApp() {
  if (!isCloudBaseServerConfigured()) {
    throw new Error('CloudBase 服务端尚未配置');
  }

  // ICloudbaseConfig 类型没声明 adapter（SDK 运行时支持），这里按超集断言
  const config = {
    env: process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID,
    region: process.env.CLOUDBASE_REGION || process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai',
    accessKey: process.env.CLOUDBASE_APIKEY,
    adapter: createIsolatedStorage(),
    timeout: 15_000,
  } satisfies CloudBaseInitConfig;

  return cloudbase.init(config);
}

/**
 * 认证代理专用实例。login/register/verify 会把它的身份切换到“终端用户”，
 * 因此它绝不能用于数据库操作，否则会失去对“仅管理员可读写”集合的权限。
 * 隔离存储保证它登录时不会污染 dataApp 用的共享存储。
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
