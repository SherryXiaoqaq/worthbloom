import { headers } from 'next/headers';
import DashboardClient from './dashboard-client';
import { isOwnerRequest } from '@/lib/server/owner';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const requestHeaders = await headers();
  if (isOwnerRequest(requestHeaders)) return <DashboardClient/>;

  return <main className="private-stage"><section className="private-card"><span className="private-brand">好</span><p>WORTHBLOOM · 好好花</p><h1>这里是一座<br/>私人的愿望花园。</h1><div className="private-flower">✿</div><p className="private-copy">朋友无需登录，也不会看到花园里的其他内容。<br/>请打开主人单独发给你的愿望链接。</p></section></main>;
}
