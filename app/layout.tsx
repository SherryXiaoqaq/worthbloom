import type { Metadata } from 'next';
import './globals.css';

const siteUrl = process.env.SITE_URL || 'https://worthbloom-haohaohua.hybrid-j9y56-1505.chatgpt.site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'WorthBloom 好好花',
  description: '让愿望被听见，让价值慢慢开花。',
  openGraph: {
    title: 'WorthBloom 好好花',
    description: '让愿望被听见，让价值慢慢开花。',
    url: siteUrl,
    siteName: 'WorthBloom 好好花',
    locale: 'zh_CN',
    type: 'website',
    images: [{ url: `${siteUrl}/og.png`, width: 1672, height: 941, alt: 'WorthBloom 好好花' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WorthBloom 好好花',
    description: '让愿望被听见，让价值慢慢开花。',
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
