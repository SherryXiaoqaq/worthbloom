import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError, loadCloudBaseDeviceFocus, saveCloudBaseDeviceFocus } from '@/lib/server/cloudbase-store';
import { getLocalDeviceFocus, LocalStoreError, setLocalDeviceFocus } from '@/lib/server/local-store';
import { isOwnerRequest, ownerOnly } from '@/lib/server/owner';

export const dynamic='force-dynamic';

async function currentUser(request:Request){
  if(isCloudBaseServerConfigured())return requireCloudBaseUser(request);
  if(!isOwnerRequest(request.headers))return null;
  return{id:'owner-preview'};
}

function failure(error:unknown){
  const status=error instanceof CloudBaseAuthError||error instanceof CloudBaseStoreError||error instanceof LocalStoreError?error.status:500;
  return Response.json({error:error instanceof Error?error.message:'电子花同步失败'},{status});
}

export async function GET(request:Request){
  try{
    const user=await currentUser(request);if(!user)return ownerOnly();
    const focusRequestId=isCloudBaseServerConfigured()?await loadCloudBaseDeviceFocus(user.id):getLocalDeviceFocus(user.id);
    return Response.json({focusRequestId});
  }catch(error){return failure(error)}
}

export async function POST(request:Request){
  try{
    const user=await currentUser(request);if(!user)return ownerOnly();
    const body=await request.json() as {requestId?:string|null};
    const requestId=body.requestId?String(body.requestId):null;
    const result=isCloudBaseServerConfigured()?await saveCloudBaseDeviceFocus(user.id,requestId):setLocalDeviceFocus(user.id,requestId);
    return Response.json(result);
  }catch(error){return failure(error)}
}
