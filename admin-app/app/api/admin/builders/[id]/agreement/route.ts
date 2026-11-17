// The builder's agreement PDF. Stored privately (lib/private-files.ts): it can only be
// opened through this route, which requires a signed-in admin session.
import { requireAdmin } from '@/lib/auth';
import { agreementKey, getBuilder, parseId, setAgreementFile } from '@/lib/builders';
import { AGREEMENT_MAX_BYTES } from '@/lib/builder-options';
import { deletePrivate, downloadName, readPrivate, savePrivatePdf } from '@/lib/private-files';
import { fail, handle, json } from '@/lib/http';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string }> };

/** View in the browser, or ?download=1 to save the PDF. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const r = await agreementKey(parseId((await ctx.params).id));
    const buf = await readPrivate(r.agreement_file);
    const file = downloadName(r.agreement_file_name, r.name);
    const mode = new URL(req.url).searchParams.get('download') ? 'attachment' : 'inline';
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buf.length),
        'Content-Disposition': `${mode}; filename="${file.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(file)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (e) { return handle(e); }
}

/** multipart/form-data: file=<PDF>. Replaces any earlier agreement document. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const s = await requireAdmin(req);
    const id = parseId((await ctx.params).id);
    if (Number(req.headers.get('content-length') || 0) > AGREEMENT_MAX_BYTES + 64 * 1024) return fail(413, 'The PDF is larger than 20 MB.');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return fail(400, 'Choose a PDF to upload.');
    const key = await savePrivatePdf(Buffer.from(await file.arrayBuffer()));
    let old: string | null;
    try { old = await setAgreementFile(id, key, file.name.slice(0, 150), s.admin.id); }
    catch (e) { await deletePrivate(key); throw e; }
    await deletePrivate(old);
    const b = await getBuilder(id);
    await logActivity(s.admin.id, 'updated', 'builders', id, `Uploaded agreement document — builder “${b.name}”`);
    return json(b, 201);
  } catch (e) { return handle(e); }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const s = await requireAdmin(req);
    const id = parseId((await ctx.params).id);
    const old = await setAgreementFile(id, null, null, s.admin.id);
    await deletePrivate(old);
    const b = await getBuilder(id);
    await logActivity(s.admin.id, 'updated', 'builders', id, `Removed agreement document — builder “${b.name}”`);
    return json(b);
  } catch (e) { return handle(e); }
}
