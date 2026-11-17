import { requireAdmin } from '@/lib/auth';
import { deleteProject, parseId, updateProject } from '@/lib/builders';
import { handle, json, readJson } from '@/lib/http';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string; pid: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const s = await requireAdmin(req);
    const { id, pid } = await ctx.params;
    const p = await updateProject(parseId(id), parseId(pid), await readJson(req), s.admin.id);
    await logActivity(s.admin.id, 'updated', 'builder_projects', p.id, `Updated builder project “${p.name}”`);
    return json(p);
  } catch (e) { return handle(e); }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const s = await requireAdmin(req);
    const { id, pid } = await ctx.params;
    const name = await deleteProject(parseId(id), parseId(pid));
    await logActivity(s.admin.id, 'deleted', 'builder_projects', pid, `Deleted builder project “${name}”`);
    return json({ ok: true });
  } catch (e) { return handle(e); }
}
