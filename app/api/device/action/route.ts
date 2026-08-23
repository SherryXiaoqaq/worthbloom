import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError, recordCloudBaseDeviceUsage } from '@/lib/server/cloudbase-store';
import { DeviceAuthError, requireDevice } from '@/lib/server/device-auth';
import { isLocalPreview, LocalStoreError, recordLocalDeviceUsage } from '@/lib/server/local-store';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const eventPattern=/^[A-Za-z0-9_-]{8,80}$/;

export async function POST(request:Request) {
  try {
    const body=await request.json() as Record<string,unknown>;
    const device=requireDevice(request,String(body.device_id || ''));
    const action=String(body.action || '');
    const assetId=String(body.asset_id || '');
    const clientEventId=String(body.client_event_id || '');
    if(action!=='USED_TODAY' || !assetId || !eventPattern.test(clientEventId)) {
      return Response.json({error:'设备事件格式不正确'},{status:400});
    }
    if(isCloudBaseServerConfigured()) {
      if(!device.ownerId)return Response.json({error:'服务器尚未配置 DEVICE_OWNER_ID'},{status:503});
      return Response.json(await recordCloudBaseDeviceUsage(device.ownerId,assetId,clientEventId));
    }
    if(isLocalPreview(request))return Response.json(recordLocalDeviceUsage(assetId,clientEventId));
    return Response.json({error:'设备接口需要 CloudBase，或在 localhost 调试'},{status:503});
  } catch(error) {
    const status=error instanceof DeviceAuthError||error instanceof CloudBaseStoreError||error instanceof LocalStoreError?error.status:500;
    return Response.json({error:error instanceof Error?error.message:'设备事件写入失败'},{status});
  }
}
