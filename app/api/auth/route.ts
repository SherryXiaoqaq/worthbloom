import { loginWithPassword, sendEmailCode, verifyEmailCode, type AuthSession } from '@/lib/server/cloudbase-auth-actions';
import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function sessionJson(session: AuthSession) {
  return json({ ok: true, accessToken: session.accessToken, user: session.user });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: '请求格式不正确' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const nickname = typeof body.nickname === 'string' ? body.nickname : undefined;

  try {
    switch (action) {
      case 'login': {
        const password = typeof body.password === 'string' ? body.password : '';
        if (!email || !password) return json({ ok: false, error: '请填写邮箱和密码' }, 400);
        const session = await loginWithPassword({ email, password, nickname });
        return sessionJson(session);
      }

      case 'register': {
        const password = typeof body.password === 'string' ? body.password : '';
        if (!email || !password) return json({ ok: false, error: '请填写邮箱和密码' }, 400);
        await sendEmailCode({ email, password });
        return json({ ok: true, message: '验证码已经发到邮箱，请在下方填写。' });
      }

      case 'verify': {
        const code = typeof body.code === 'string' ? body.code : '';
        if (!email || !code) return json({ ok: false, error: '请填写邮箱和验证码' }, 400);
        const session = await verifyEmailCode({ email, code, nickname });
        return sessionJson(session);
      }

      case 'me': {
        const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';
        if (!accessToken) return json({ ok: false, error: '未登录' }, 401);
        const profile = await requireCloudBaseUser(new Request(request.url, { headers: { authorization: `Bearer ${accessToken}` } }));
        return json({ ok: true, user: profile });
      }

      case 'logout': {
        // 浏览器侧 token 随即清除即失效；服务端撤销为尽力而为，无需阻塞。
        return json({ ok: true });
      }

      default:
        return json({ ok: false, error: '未知操作' }, 400);
    }
  } catch (reason) {
    const message = reason instanceof Error && reason.message ? reason.message : '操作失败，请稍后重试';
    const status = reason instanceof CloudBaseAuthError ? reason.status : 400;
    return json({ ok: false, error: message }, status);
  }
}
