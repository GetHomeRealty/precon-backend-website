import { requireAdmin } from '@/lib/auth';
import { deleteBuilder, getBuilder, parseId, updateBuilder } from '@/lib/builders';
import { agreementLabel } from '@/lib/builder-options';
import { deletePrivate } from '@/lib/private-files';
import { handle, json, readJson } from '@/lib/http';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireAdmin(req);
    return json(await getBuilder(parseId((await ctx.params).id)));
  } catch (e) { return handle(e); }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const s = await requireAdmin(req);
    const id = parseId((await ctx.params).id);
    const body = await readJson(req);
    const b = await updateBuilder(id, body, s.admin.id);
    const keys = Object.keys(body || {});
    const what = keys.length === 1 && keys[0] === 'agreement_status' ? `Agreement status: ${agreementLabel(b.agreement_status)}` : 'Updated';
    await logActivity(s.admin.id, 'updated', 'builders', id, `${what} — builder “${b.name}”`);
    return json(b);
  } catch (e) { return handle(e); }
}

/** Removes the builder, its projects and its agreement file. Administrators only. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const s = await requireAdmin(req, { role: 'admin' });
    const id = parseId((await ctx.params).id);
    const r = await deleteBuilder(id);
    await deletePrivate(r.agreement_file);
    await logActivity(s.admin.id, 'deleted', 'builders', id, `Deleted builder “${r.name}”`);
    return json({ ok: true });
  } catch (e) { return handle(e); }
}
