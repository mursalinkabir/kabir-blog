'use server';

import config from '@payload-config';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createLocalReq, getPayload } from 'payload';
import { z } from 'zod';
import { setAgentImageUpload } from '../mcp/imageUploadPermission';

const uploadSetting = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().safe()),
  enabled: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

export async function setAgentImageUploadAction(form: FormData) {
  const requestHeaders = await headers();
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: requestHeaders });
  const req = await createLocalReq({ user: user ?? undefined }, payload);
  const { id, enabled } = uploadSetting.parse({ id: form.get('id'), enabled: form.get('enabled') });
  await setAgentImageUpload(req, id, enabled);
  revalidatePath(payload.config.routes.admin);
}
