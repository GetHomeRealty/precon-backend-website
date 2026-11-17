import { requireAdmin } from '@/lib/auth';
import { importWebsiteProjects } from '@/lib/builders';
import { handle, json } from '@/lib/http';
import { logActivity } from '@/lib/activity';

/** Add builders + builder projects from the website's project list (only what is not imported yet). */
export async function POST(req: Request) {
  try {
    const s = await requireAdmin(req);
    const r = await importWebsiteProjects(s.admin.id);
    if (r.builders || r.projects) {
      await logActivity(s.admin.id, 'created', 'builders', null,
        `Imported ${r.projects} website project${r.projects === 1 ? '' : 's'} into Builder Management (${r.builders} new builder${r.builders === 1 ? '' : 's'})`);
    }
    return json(r);
  } catch (e) { return handle(e); }
}
