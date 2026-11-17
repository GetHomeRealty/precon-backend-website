import { requireAdmin } from '@/lib/auth';
import { createProject, parseId } from '@/lib/builders';
import { handle, json, readJson } from '@/lib/http';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const s = await requireAdmin(req);
    const builderId = parseId((await ctx.params).id);
    const p = await createProject(builderId, await readJson(req), s.admin.id);
    await logActivity(s.admin.id, 'created', 'builder_projects', p.id, `Added builder project “${p.name}”`);
    return json(p, 201);
  } catch (e) { return handle(e); }
}
