import { headers } from 'next/headers';
import WorthBloomMainClient from './worthbloom-main-client';
import CloudBaseAuthGate from './cloudbase-auth-gate';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { isOwnerRequest } from '@/lib/server/owner';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const envId = process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID || '';
  const publishableKey = process.env.CLOUDBASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY || '';
  const cloudBaseConfigured = isCloudBaseServerConfigured() && Boolean(publishableKey);
  if (cloudBaseConfigured) return <CloudBaseAuthGate config={{ envId, publishableKey, region: process.env.CLOUDBASE_REGION || process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai' }}><WorthBloomMainClient/></CloudBaseAuthGate>;

  const requestHeaders = await headers();
  if (isOwnerRequest(requestHeaders)) return <WorthBloomMainClient/>;

  return <main className="private-stage"><section className="private-card"><span className="private-brand">好</span><p>WORTHBLOOM · 好好花</p><h1>这里是一座<br/>私人的愿望花园。</h1><div className="private-flower">✿</div><p className="private-copy">朋友无需登录，也不会看到花园里的其他内容。<br/>请打开主人单独发给你的愿望链接。</p></section></main>;
}
