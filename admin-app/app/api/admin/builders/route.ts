import { requireAdmin } from '@/lib/auth';
import { createBuilder, listBuilders } from '@/lib/builders';
import { handle, json, readJson } from '@/lib/http';
import { logActivity } from '@/lib/activity';

/** All builders (search ?q=, filters ?location= &status=) with their project counts. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const sp = new URL(req.url).searchParams;
    return json(await listBuilders({
      q: (sp.get('q') || '').trim().slice(0, 100) || undefined,
      location: (sp.get('location') || '').trim().slice(0, 200) || undefined,
      status: (sp.get('status') || '').trim().slice(0, 40) || undefined,
    }));
  } catch (e) { return handle(e); }
}

export async function POST(req: Request) {
  try {
    const s = await requireAdmin(req);
    const b = await createBuilder(await readJson(req), s.admin.id);
    await logActivity(s.admin.id, 'created', 'builders', b.id, `Added builder “${b.name}”`);
    return json(b, 201);
  } catch (e) { return handle(e); }
}
