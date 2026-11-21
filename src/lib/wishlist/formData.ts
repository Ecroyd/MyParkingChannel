// Reading the request form: a `data` JSON field plus any number of `files`.

import { MAX_FILE_BYTES, MAX_FILES, itemSchema, type ItemInput } from './fields';

export type ParsedForm =
  | { ok: true; input: ItemInput; files: File[]; keep: string[] | null }
  | { ok: false; error: string };

export async function parseItemForm(req: Request): Promise<ParsedForm> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, error: 'Check the form.' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get('data') ?? ''));
  } catch {
    return { ok: false, error: 'Check the form.' };
  }
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };

  const files = form.getAll('files').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f && f.size > 0);
  const keepRaw = form.get('keep');
  let keep: string[] | null = null;
  if (typeof keepRaw === 'string') {
    try {
      const k = JSON.parse(keepRaw);
      keep = Array.isArray(k) ? k.filter((p): p is string => typeof p === 'string') : [];
    } catch {
      keep = [];
    }
  }
  const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
  if (tooBig) return { ok: false, error: `${tooBig.name} is over ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  if (files.length + (keep?.length ?? 0) > MAX_FILES) return { ok: false, error: `Add at most ${MAX_FILES} files.` };
  return { ok: true, input: parsed.data, files, keep };
}
