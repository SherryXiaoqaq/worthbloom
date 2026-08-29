import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { loadCloudBaseData, loadCloudBaseDeviceFocus } from '@/lib/server/cloudbase-store';
import { DeviceAuthError, requireDevice } from '@/lib/server/device-auth';
import { deriveDeviceState } from '@/lib/server/device-state';
import { getLocalData, getLocalDeviceFocus, isLocalPreview } from '@/lib/server/local-store';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(request:Request) {
  try {
    const url=new URL(request.url);
    const device=requireDevice(request,url.searchParams.get('device_id') || '');
    if(isCloudBaseServerConfigured()) {
      if(!device.ownerId)return Response.json({error:'服务器尚未配置 DEVICE_OWNER_ID'},{status:503});
      const [data,focusRequestId]=await Promise.all([loadCloudBaseData(device.ownerId),loadCloudBaseDeviceFocus(device.ownerId)]);
      return Response.json(deriveDeviceState(data,Date.now(),focusRequestId),{headers:{'cache-control':'no-store'}});
    }
    if(isLocalPreview(request))return Response.json(deriveDeviceState(getLocalData(),Date.now(),getLocalDeviceFocus('owner-preview')),{headers:{'cache-control':'no-store'}});
    return Response.json({error:'设备接口需要 CloudBase，或在 localhost 调试'},{status:503});
  } catch(error) {
    const status=error instanceof DeviceAuthError?error.status:500;
    return Response.json({error:error instanceof Error?error.message:'读取设备状态失败'},{status});
  }
}
