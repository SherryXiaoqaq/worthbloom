import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { isLocalPreview } from './local-store';

export class DeviceAuthError extends Error {
  constructor(message:string, public status=401) { super(message); }
}

function safeEqual(left:string, right:string) {
  const leftBuffer=Buffer.from(left);
  const rightBuffer=Buffer.from(right);
  return leftBuffer.length===rightBuffer.length && timingSafeEqual(leftBuffer,rightBuffer);
}

export function requireDevice(request:Request, suppliedDeviceId:string) {
  const local=isLocalPreview(request);
  const expectedId=process.env.DEVICE_ID || 'flower_01';
  const expectedKey=process.env.DEVICE_SHARED_SECRET || (local?'worthbloom-local-device':'');
  const actualKey=request.headers.get('x-device-key') || '';

  if(!expectedKey)throw new DeviceAuthError('服务器尚未配置设备密钥',503);
  if(!safeEqual(suppliedDeviceId,expectedId) || !safeEqual(actualKey,expectedKey)) {
    throw new DeviceAuthError('设备编号或密钥不正确');
  }
  return {id:expectedId,ownerId:process.env.DEVICE_OWNER_ID || ''};
}
