import type { ShoppingProfileItem, WishType } from '@/lib/types';
import { canonicalWishType, typeToCategory } from '@/lib/wish-compat';
import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError, saveCloudBaseShoppingProfile } from '@/lib/server/cloudbase-store';
import { AiServiceError, generateJson, isAiConfigured } from '@/lib/server/ai/client';
import { LocalStoreError, saveLocalShoppingProfile } from '@/lib/server/local-store';
import { isOwnerRequest, ownerOnly } from '@/lib/server/owner';

export const dynamic='force-dynamic';
const imagePattern=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

async function currentUser(request:Request){if(isCloudBaseServerConfigured())return requireCloudBaseUser(request);if(!isOwnerRequest(request.headers))return null;return{id:'owner-preview'}}

function normalizeItems(raw:unknown,imageIndex:number):ShoppingProfileItem[]{
  const items=Array.isArray(raw)?raw:[];
  return items.slice(0,20).map(entry=>{const item=(entry??{}) as Record<string,unknown>;const price=Number(item.price);const type=canonicalWishType(item.type,typeof item.category==='string'?item.category:undefined) as WishType;return{id:crypto.randomUUID(),name:String(item.name||'未命名商品').trim().slice(0,120),type,category:typeToCategory(type),price:Number.isFinite(price)&&price>=0?price:null,sourceImageIndex:imageIndex,confidence:Math.max(0,Math.min(1,Number(item.confidence)||.5))}}).filter(item=>item.name!=='未命名商品');
}

export async function POST(request:Request){
  try{
    const user=await currentUser(request);if(!user)return ownerOnly();
    if(!isAiConfigured())return Response.json({error:'AI 尚未配置，暂时无法整理购物截图'},{status:503});
    const body=await request.json() as {images?:string[];consent?:boolean};
    if(body.consent!==true)return Response.json({error:'请在自愿同意后再提交截图'},{status:400});
    const images=(body.images??[]).slice(0,3);if(!images.length)return Response.json({error:'请至少选择一张购物截图'},{status:400});
    const extracted:ShoppingProfileItem[]=[];
    for(const [imageIndex,dataUrl] of images.entries()){
      const match=dataUrl.match(imagePattern);if(!match||match[2].length>7_000_000)return Response.json({error:'仅支持不超过 5MB 的 JPG、PNG、WebP 图片'},{status:400});
      const {data}=await generateJson({system:'你只负责从购物截图或购物车截图中提取明确可见的商品。不要推测用户身份、收入、健康、性别等敏感信息。只返回 JSON。',prompt:'提取商品名称、人民币价格和类型。类型只能是 DURABLE_GOOD、SINGLE_USE、MEMBERSHIP、STORED_VALUE、COURSE_TRAINING、OTHER。返回 {"items":[{"name":"","price":null,"type":"OTHER","confidence":0.8}]}。看不清的商品不要输出。',image:{base64:dataUrl,mimeType:`image/${match[1]}`},maxTokens:1200});
      extracted.push(...normalizeItems(data.items,imageIndex));
    }
    if(!extracted.length)return Response.json({error:'没有识别到足够清楚的商品，请换一张更完整的截图'},{status:422});
    const profile=isCloudBaseServerConfigured()?await saveCloudBaseShoppingProfile(user.id,extracted):saveLocalShoppingProfile(user.id,extracted);
    return Response.json({profile,pointsAwarded:10,originalImagesStored:false});
  }catch(error){const status=error instanceof CloudBaseAuthError||error instanceof CloudBaseStoreError||error instanceof LocalStoreError||error instanceof AiServiceError?error.status:500;return Response.json({error:error instanceof Error?error.message:'购物截图整理失败'},{status})}
}
