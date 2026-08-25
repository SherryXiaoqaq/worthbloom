import 'server-only';

/**
 * 纯 HTTP 的 CloudBase 文档数据库客户端。
 *
 * 为什么不用 @cloudbase/js-sdk：
 * 该 SDK 在同一个 Node 进程里，所有 cloudbase.init() 实例共享同一份模块级
 * localStorage。登录后（authApp）用户会话被写进共享存储，数据实例（dataApp）
 * 发起的数据库请求会自动顶替成“用户身份”，从而对“仅管理员/服务端可读写”的
 * 集合失去权限——读取返回空、写入静默失败。这就是“创建的心愿刷新后消失 /
 * 邀请链接 404”的根因。给实例配隔离 adapter 的方案在生产 ESM 构建下不可靠。
 *
 * 这里的方案：数据层彻底绕开 js-sdk，直接用腾讯官方数据库 HTTP API。
 * 鉴权用服务端 API Key（CLOUDBASE_APIKEY）作为 Bearer token——它就是管理员
 * 身份，官方文档与 SDK 源码（getClientCredential 直接返回 accessKey）双重确认。
 * 请求格式完全复刻 SDK v3.8.1 数据库模块的真实请求。
 *
 * 接口：https://{env}.api.tcloudbasegateway.com/v1/database/instances/(default)/databases/(default)
 */

export class CloudBaseHttpError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

type CloudDocument = Record<string, unknown> & { _id?: string; id?: string };

function serverConfig() {
  const envId = process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  const apiKey = process.env.CLOUDBASE_APIKEY;
  if (!envId || !apiKey) throw new CloudBaseHttpError('CloudBase 服务端尚未配置', 500);
  return { envId, apiKey };
}

function baseUrl() {
  const { envId } = serverConfig();
  const region = process.env.CLOUDBASE_REGION || process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai';
  const domesticRegions = ['ap-shanghai', 'ap-guangzhou', 'ap-beijing', 'ap-chengdu', 'ap-chongqing', 'ap-shenzhen', 'ap-hongkong'];
  const host = domesticRegions.includes(region)
    ? `${envId}.api.tcloudbasegateway.com`
    : `${envId}.api.intl.tcloudbasegateway.com`;
  return `https://${host}/v1/database/instances/(default)/databases/(default)`;
}

type RawResponse = Record<string, unknown> & {
  code?: string;
  message?: string;
  list?: unknown;
  updated?: number;
};

/**
 * 解码 MongoDB Extended JSON（EJSON，Strict 格式）。
 * 数据库响应里的数字/日期等会被包装成 {"$numberInt":"1"} 这样的对象，
 * 这里把它们还原成普通 JS 值（与 SDK 的 safeParseEJSON 行为一致）。
 */
function decodeEJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeEJSON);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 1) {
      const entry = (value as Record<string, unknown>)[keys[0]];
      switch (keys[0]) {
        case '$numberInt':
        case '$numberLong':
        case '$numberDouble':
        case '$numberDecimal':
          return Number(entry);
        case '$oid':
          return String(entry); // ObjectId 按字符串使用
        case '$date':
          // 存进去的日期都是 ISO 字符串，$date 不会出现在本应用数据里；保险起见转 ISO
          return entry ? String(entry) : null;
        case '$binary':
          return String((entry as { base64?: unknown })?.base64 ?? '');
        case '$timestamp':
          return Number((entry as { t?: unknown })?.t ?? 0);
        case '$regex':
          return entry;
        case '$undefined':
        case '$null':
          return null;
      }
    }
    const decoded: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      decoded[key] = decodeEJSON(item);
    }
    return decoded;
  }
  return value;
}

async function rawRequest(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<RawResponse> {
  const { apiKey } = serverConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new CloudBaseHttpError('暂时无法连接 CloudBase 数据库', 502);
  }

  const text = await response.text();
  let json: RawResponse | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as RawResponse;
    } catch {
      /* 非 JSON 响应，走下面的错误分支 */
    }
  }

  const code = typeof json?.code === 'string' && json.code ? json.code : '';
  if (!response.ok || code) {
    const rawMessage = json && (typeof json.message === 'string' ? json.message : json.error);
    const message = typeof rawMessage === 'string' && rawMessage ? rawMessage : code || `CloudBase 数据库请求失败（HTTP ${response.status}）`;
    const status = response.status >= 400 && response.status < 600 ? response.status : 500;
    throw new CloudBaseHttpError(String(message), status);
  }
  return json || {};
}

function queryString(params: Record<string, unknown>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value))}`);
  }
  return parts.join('&');
}

export interface CloudBaseHttpQuery {
  limit(n: number): CloudBaseHttpQuery;
  get(): Promise<{ data: CloudDocument[] }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
}

export interface CloudBaseHttpDoc {
  get(): Promise<{ data: CloudDocument[] }>;
  set(data: Record<string, unknown>): Promise<{ ok: boolean }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
  remove(): Promise<{ ok: boolean }>;
}

export interface CloudBaseHttpCollection {
  where(filter: Record<string, unknown>): CloudBaseHttpQuery;
  doc(id: string): CloudBaseHttpDoc;
}

function collection(name: string): CloudBaseHttpCollection {
  const pathPrefix = `/collections/${name}/documents`;

  function queryRef(filter?: Record<string, unknown>) {
    let limitValue = 100;
    const ref: CloudBaseHttpQuery = {
      limit(n: number) {
        limitValue = n;
        return ref;
      },
      async get() {
        const qs = queryString({
          limit: limitValue,
          offset: 0,
          query: filter ? JSON.stringify(filter) : undefined,
        });
        const json = await rawRequest(`${pathPrefix}?${qs}`, 'GET');
        const list = json.list as unknown;
        return { data: Array.isArray(list) ? (list as CloudDocument[]).map(doc => decodeEJSON(doc) as CloudDocument) : [] };
      },
      async update(data: Record<string, unknown>) {
        const json = await rawRequest(pathPrefix, 'PATCH', {
          query: filter ?? {},
          data,
          multi: true,
          upsert: false,
          replaceMode: false,
        });
        const updated = json.updated as number | undefined;
        return { updated: typeof updated === 'number' ? updated : 0 };
      },
    };
    return ref;
  }

  return {
    where(filter: Record<string, unknown>) {
      return queryRef(filter);
    },
    doc(id: string): CloudBaseHttpDoc {
      return {
        async get() {
          const qs = queryString({ limit: 100, offset: 0, query: JSON.stringify({ _id: id }) });
          const json = await rawRequest(`${pathPrefix}?${qs}`, 'GET');
          const list = json.list as unknown;
          return { data: Array.isArray(list) ? (list as CloudDocument[]).map(doc => decodeEJSON(doc) as CloudDocument) : [] };
        },
        async set(data: Record<string, unknown>) {
          await rawRequest(pathPrefix, 'PATCH', {
            query: { _id: id },
            data,
            multi: false,
            upsert: true,
            replaceMode: false,
          });
          return { ok: true };
        },
        async update(data: Record<string, unknown>) {
          const json = await rawRequest(pathPrefix, 'PATCH', {
            query: { _id: id },
            data,
            multi: false,
            upsert: false,
            replaceMode: false,
          });
          const updated = json.updated as number | undefined;
          return { updated: typeof updated === 'number' ? updated : 0 };
        },
        async remove() {
          await rawRequest(`${pathPrefix}/remove`, 'POST', { query: { _id: id }, multi: false });
          return { ok: true };
        },
      };
    },
  };
}

/**
 * 数据层专用数据库句柄。永远以服务端 API Key 的管理员身份读写，
 * 与任何用户登录态完全隔离。
 */
export function getCloudBaseDb() {
  return { collection };
}
