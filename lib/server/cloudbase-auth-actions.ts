import 'server-only';

import { getCloudBaseServer } from './cloudbase';

/**
 * 服务端认证代理。
 *
 * 浏览器端不再直接调用 CloudBase 身份认证网关（那会触发跨域白名单检查，
 * 而免费体验版无法往白名单添加带随机后缀的默认域名）。这里由服务端用
 * CLOUDBASE_APIKEY 以 SDK 方式完成登录/注册/验证码校验，浏览器只和
 * 本服务器（同源）通信，跨域检查不存在，白名单限制彻底绕开。
 */

export type AuthSession = {
  accessToken: string;
  user: { id: string; email: string; nickName?: string | null };
};

// getVerification/verify 是 SDK 公开方法但未进入其主类型面，这里补一组最小类型。
// 邮箱验证码注册是「无状态」的：发送验证码时把 verification_id 交给浏览器暂存，
// 填码时再回传。服务端不保存任何注册中间状态——云托管会按需扩缩容/回收实例，
// 进程内存里的状态会在两次请求之间丢失（此前「请先点击“发送邮箱验证码”」的根因）。
type VerificationApi = {
  getVerification(params: { email: string; usage: string }): Promise<{ verification_id?: string; is_user?: boolean }>;
  verify(params: { verification_id: string; verification_code: string }): Promise<{ verification_token?: string }>;
  signIn(params: { username: string; verification_token: string }): Promise<unknown>;
  signUp(params: Record<string, unknown>): Promise<unknown>;
};

function verificationApi() {
  return getCloudBaseServer().auth() as unknown as VerificationApi;
}

function auth() {
  return getCloudBaseServer().auth();
}

async function readSession(): Promise<AuthSession> {
  const { accessToken } = await auth().getAccessToken();
  const user = await auth().getCurrentUser() as Record<string, unknown> | null | undefined;
  const email = typeof user?.email === 'string' ? user.email : '';
  const id = typeof user?.id === 'string' ? user.id : (typeof user?.uid === 'string' ? String(user.uid) : (typeof user?.sub === 'string' ? user.sub : ''));
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const nickName = typeof user?.nickName === 'string' ? user.nickName : (typeof metadata.nickName === 'string' ? metadata.nickName : null);
  return { accessToken, user: { id, email, nickName } };
}

/** 尽力而为地写入昵称到 CloudBase 用户资料（跨设备同步用，失败不影响登录）。 */
async function tryUpdateNickname(nickname?: string) {
  const name = nickname?.trim();
  if (!name) return;
  try {
    const user = await auth().getCurrentUser() as { update?: (info: Record<string, unknown>) => Promise<void> } | null | undefined;
    await user?.update?.({ nickName: name });
  } catch {
    /* 忽略：本地 localStorage 兜底 */
  }
}

/**
 * 登录/注册完成后，把认证实例的用户会话清掉。
 * accessToken 已交给浏览器，服务端无需保留用户会话；登出能避免该会话
 * 通过共享持久化污染数据层实例（数据层必须始终保持服务端身份）。
 */
async function resetAuthSession() {
  try {
    await auth().signOut();
  } catch {
    /* 尽力而为，不影响已完成的登录 */
  }
}

function authErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof Error && reason.message) return reason.message;
  return fallback;
}

/** 登录（邮箱 + 密码）。成功后返回可签发请求的 accessToken 和用户信息。 */
export async function loginWithPassword(params: { email: string; password: string; nickname?: string }): Promise<AuthSession> {
  let result: { error?: { message?: string } | null };
  try {
    result = await auth().signInWithPassword({ email: params.email, password: params.password });
  } catch (reason) {
    throw new Error(authErrorMessage(reason, '登录失败，请稍后重试'));
  }
  if (result?.error) throw new Error(result.error.message || '登录失败');
  const session = await readSession();
  await tryUpdateNickname(params.nickname);
  await resetAuthSession();
  return session;
}

/** 发送邮箱验证码（注册第一步）。返回 verificationId/isUser，由浏览器暂存并回传。 */
export async function sendEmailCode(params: { email: string; password: string }): Promise<{ verificationId: string; isUser: boolean }> {
  let verification: { verification_id?: string; is_user?: boolean } | null = null;
  try {
    verification = await verificationApi().getVerification({ email: params.email, usage: 'email' });
  } catch (reason) {
    throw new Error(authErrorMessage(reason, '验证码发送失败，请稍后重试'));
  }
  const verificationId = verification?.verification_id;
  if (!verificationId) throw new Error('CloudBase 没有返回验证码校验步骤');
  return { verificationId, isUser: Boolean(verification?.is_user) };
}

/** 用邮箱验证码完成注册/登录（无状态）。逻辑与 SDK 内部 verifyOtp 一致：先验码拿到
 * verification_token，已有账号直接登录，新账号用 token + 验证码完成注册。 */
export async function verifyEmailCode(params: {
  email: string;
  code: string;
  password: string;
  nickname?: string;
  verificationId: string;
  isUser: boolean;
}): Promise<AuthSession> {
  const api = verificationApi();
  let verificationToken = '';
  try {
    const verified = await api.verify({ verification_id: params.verificationId, verification_code: params.code.trim() });
    verificationToken = verified?.verification_token ?? '';
  } catch (reason) {
    throw new Error(authErrorMessage(reason, '验证码不正确'));
  }
  if (!verificationToken) throw new Error('验证码不正确');
  try {
    if (params.isUser) {
      await api.signIn({ username: params.email, verification_token: verificationToken });
    } else {
      await api.signUp({ email: params.email, password: params.password, verification_token: verificationToken, verification_code: params.code.trim() });
    }
  } catch (reason) {
    throw new Error(authErrorMessage(reason, '注册没有完成，请稍后重试'));
  }
  const session = await readSession();
  await tryUpdateNickname(params.nickname);
  await resetAuthSession();
  return session;
}
