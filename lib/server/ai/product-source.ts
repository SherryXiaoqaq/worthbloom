import 'server-only';

export class ProductSourceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const MAX_PAGE_BYTES = 900_000;
const MAX_PROMPT_CHARS = 18_000;

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function assertPublicProductUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new ProductSourceError('商品链接格式不正确'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ProductSourceError('商品链接只能使用 http 或 https');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost'
    || hostname === '::1'
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || isPrivateIpv4(hostname)
  ) throw new ProductSourceError('不能读取本机或局域网链接');
  url.hash = '';
  return url;
}

async function readLimitedText(response: Response) {
  if (!response.body) return (await response.text()).slice(0, MAX_PAGE_BYTES);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let output = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel();
      break;
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return '';
}

export async function readProductPage(rawUrl: string) {
  let url = assertPublicProductUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetch(url, {
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'Mozilla/5.0 (compatible; WorthBloom/1.0; +https://worthbloom.app)',
        },
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new ProductSourceError('商品链接重定向次数过多', 422);
        url = assertPublicProductUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new ProductSourceError(`商品页面无法读取（${response.status}）`, 422);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        throw new ProductSourceError('这个链接不是可读取的商品网页', 422);
      }
      const html = await readLimitedText(response);
      const title = metaContent(html, 'og:title') || decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '');
      const description = metaContent(html, 'og:description') || metaContent(html, 'description');
      const price = metaContent(html, 'product:price:amount') || metaContent(html, 'og:price:amount');
      const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
        .map(match => match[1].trim())
        .join('\n')
        .slice(0, 9_000);
      const visibleText = decodeEntities(html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' '))
        .slice(0, 7_000);
      const promptText = [
        `最终链接：${url.toString()}`,
        title && `网页标题：${title}`,
        description && `网页描述：${description}`,
        price && `页面价格元数据：${price}`,
        jsonLd && `JSON-LD：${jsonLd}`,
        visibleText && `页面正文：${visibleText}`,
      ].filter(Boolean).join('\n').slice(0, MAX_PROMPT_CHARS);
      return { url: url.toString(), promptText, title };
    }
    throw new ProductSourceError('商品页面无法读取', 422);
  } catch (error) {
    if (error instanceof ProductSourceError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ProductSourceError('读取商品页面超时，请改用截图', 504);
    throw new ProductSourceError(error instanceof Error ? `读取商品页面失败：${error.message}` : '读取商品页面失败', 422);
  } finally {
    clearTimeout(timeout);
  }
}
