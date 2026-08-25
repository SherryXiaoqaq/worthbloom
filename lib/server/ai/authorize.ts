import 'server-only';

import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { isOwnerRequest } from '@/lib/server/owner';

export class AiAuthorizationError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

export async function authorizeAiRequest(request: Request) {
  if (isCloudBaseServerConfigured()) {
    try {
      await requireCloudBaseUser(request);
      return;
    } catch (error) {
      if (error instanceof CloudBaseAuthError) throw new AiAuthorizationError(error.message, error.status);
      throw error;
    }
  }
  if (!isOwnerRequest(request.headers)) throw new AiAuthorizationError('只有心愿主人可以使用 AI 助手');
}
