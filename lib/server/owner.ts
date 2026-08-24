import { isLocalPreviewHostname } from './network';

const OWNER_USER_ID = '067a7e4c-fdbe-4765-baf8-35997b8213e3';

export function isOwnerRequest(headers: Pick<Headers, 'get'>) {
  const host = headers.get('host') ?? '';
  if (isLocalPreviewHostname(host)) return true;
  return headers.get('oai-authenticated-user-id') === OWNER_USER_ID;
}

export function ownerOnly() {
  return Response.json({ error: '这里是心愿主人的私人花园' }, { status: 401 });
}
