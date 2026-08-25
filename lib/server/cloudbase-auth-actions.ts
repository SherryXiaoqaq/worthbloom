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

type VerifyOtpFn = (params: { token: string }) => Promise<{ error?: { message?: string } | null }>;

export type AuthSession = {
  accessToken: string;
  user: { id: string; email: string; nickName?: string | null };
};

// 暂存「待完成注册」的验证码校验函数（以邮箱为键）。
// signUp() 返回的 verifyOtp 闭包只捕获注册时拿到的 verification_id，加上用户
// 填写的验证码就是一次无状态 HTTP 调用（/v1/verification/verify），
// 因此跨请求保存到内存 Map 是安全的，不会依赖 SDK 的全局登录态。
const pendingVerifications = new Map<string, VerifyOtpFn>();

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

/** 发送邮箱验证码（注册第一步）。把 verifyOtp 闭包暂存，等用户填码后再校验。 */
export async function sendEmailCode(params: { email: string; password: string }): Promise<void> {
  let result: { error?: { message?: string } | null; data?: { verifyOtp?: VerifyOtpFn } };
  try {
    result = await auth().signUp({ email: params.email, password: params.password });
  } catch (reason) {
    throw new Error(authErrorMessage(reason, '验证码发送失败，请稍后重试'));
  }
  if (result?.error) throw new Error(result.error.message || '验证码发送失败');
  const verifyOtp = result?.data?.verifyOtp;
  if (typeof verifyOtp !== 'function') throw new Error('CloudBase 没有返回验证码校验步骤');
  pendingVerifications.set(params.email, verifyOtp);
}

/** 用邮箱验证码完成注册。成功后返回 accessToken 和用户信息。 */
export async function verifyEmailCode(params: { email: string; code: string; nickname?: string }): Promise<AuthSession> {
  const verifyOtp = pendingVerifications.get(params.email);
  if (!verifyOtp) throw new Error('请先点击“发送邮箱验证码”');
  let verified: { error?: { message?: string } | null };
  try {
    verified = await verifyOtp({ token: params.code.trim() });
  } catch (reason) {
    throw new Error(authErrorMessage(reason, '验证码不正确'));
  }
  if (verified?.error) throw new Error(verified.error.message || '验证码不正确');
  pendingVerifications.delete(params.email);
  const session = await readSession();
  await tryUpdateNickname(params.nickname);
  await resetAuthSession();
  return session;
}
