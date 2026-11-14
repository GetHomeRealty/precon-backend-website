// POST /api/public/view  {id: "<project slug>"}
// Counts one view of a project (sent by the site when a visitor opens it). Anonymous:
// only a per-project daily total is stored — no IP, no visitor id. Same-site requests only,
// published projects only, and rate-limited per connection so totals can't be pumped.
import { one, q } from '@/lib/db';
import { clientIp } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';

const ok = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin) {
      const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
      let same = false; try { same = new URL(origin).host === host; } catch { /* "null" etc. */ }
      if (!same) return ok(); // silently ignore cross-site pings
    }
    if (!rateLimit(`view:${clientIp(req)}`, 120, 10 * 60_000)) return ok();
    const text = (await req.text()).slice(0, 300);
    let slug = '';
    try { slug = String(JSON.parse(text).id || ''); } catch { return ok(); }
    if (!/^[a-z0-9-]{2,100}$/.test(slug)) return ok();
    if (!(await one('select 1 from projects where slug = $1 and is_published', [slug]))) return ok();
    await q(
      `insert into project_views (slug, day, views) values ($1, current_date, 1)
       on conflict (slug, day) do update set views = project_views.views + 1`, [slug]);
    return ok();
  } catch {
    return ok(); // never break a page over analytics
  }
}
