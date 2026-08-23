import 'server-only';

export class CloudBaseAuthError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

type CloudBaseUserProfile = {
  sub?: string;
  id?: string;
  uid?: string;
  email?: string;
};

export async function requireCloudBaseUser(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new CloudBaseAuthError('请先登录再进入愿望花园');
  }

  const envId = process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  if (!envId) throw new CloudBaseAuthError('CloudBase 环境 ID 未配置', 500);
  const apiBase = (process.env.CLOUDBASE_API_BASE_URL || `https://${envId}.api.tcloudbasegateway.com`).replace(/\/$/, '');

  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/v1/user/me`, {
      headers: { accept: 'application/json', authorization },
      cache: 'no-store',
    });
  } catch {
    throw new CloudBaseAuthError('暂时无法连接 CloudBase 身份认证', 502);
  }

  if (!response.ok) {
    throw new CloudBaseAuthError(response.status === 401 ? '登录已过期，请重新登录' : 'CloudBase 身份验证失败', response.status === 401 ? 401 : 502);
  }

  const profile = await response.json() as CloudBaseUserProfile;
  const id = profile.sub || profile.id || profile.uid;
  if (!id) throw new CloudBaseAuthError('CloudBase 没有返回有效的用户 ID', 502);
  return { id, email: profile.email || null };
}
