import Link from 'next/link';
import { Eye } from 'lucide-react';
import { plain, q } from '@/lib/db';

export const metadata = { title: 'Project Views' };
export const dynamic = 'force-dynamic';

/** Every project with its website view counts (anonymous daily totals) and how many leads saw it. */
export default async function ProjectViews() {
  const rows = (await q(
    `select p.id, p.name, p.slug, p.city, p.location, p.is_published,
            coalesce(sum(v.views) filter (where v.day > current_date - 7), 0)::int  as d7,
            coalesce(sum(v.views) filter (where v.day > current_date - 30), 0)::int as d30,
            coalesce(sum(v.views), 0)::int as total,
            (select count(*)::int from leads l
              where l.project_id = p.id
                 or l.viewed_projects @> jsonb_build_array(jsonb_build_object('slug', p.slug))) as leads
       from projects p left join project_views v on v.slug = p.slug
      group by p.id
      order by total desc, d30 desc, p.name`)).map((r) => plain(r));
  const since = (await q(`select min(day) as d from project_views`))[0]?.d;
  const sum = (k: string) => rows.reduce((n, r) => n + Number(r[k] || 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Project Views</h1>
          <p>How often each project is opened on the website, and how many leads looked at it.
            {since ? ` Counting since ${new Date(since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.` : ' Counting starts with the next visit.'}</p>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><span className="ic"><Eye size={19} /></span><span className="num">{sum('d7').toLocaleString()}</span><span className="lbl">Views, last 7 days</span></div>
        <div className="card stat"><span className="ic"><Eye size={19} /></span><span className="num">{sum('d30').toLocaleString()}</span><span className="lbl">Views, last 30 days</span></div>
        <div className="card stat"><span className="ic"><Eye size={19} /></span><span className="num">{sum('total').toLocaleString()}</span><span className="lbl">Views, all time</span></div>
      </div>

      <section className="card">
        <div className="card-head"><div><h2>All projects</h2><p>Most viewed first. “Leads” counts enquiries about the project or whose visitor viewed it.</p></div></div>
        <table className="tbl stack">
          <thead><tr><th>Project</th><th>Area</th><th style={{ textAlign: 'right' }}>7 days</th><th style={{ textAlign: 'right' }}>30 days</th><th style={{ textAlign: 'right' }}>All time</th><th style={{ textAlign: 'right' }}>Leads</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Project"><Link className="link" href={`/admin/projects/${r.id}`}>{r.name}</Link>{!r.is_published && <span className="badge" style={{ marginLeft: 8 }}>Draft</span>}</td>
                <td data-label="Area">{[r.location, r.city].filter(Boolean).join(', ') || '—'}</td>
                <td data-label="7 days" style={{ textAlign: 'right' }}>{r.d7}</td>
                <td data-label="30 days" style={{ textAlign: 'right' }}>{r.d30}</td>
                <td data-label="All time" style={{ textAlign: 'right', fontWeight: 600 }}>{r.total}</td>
                <td data-label="Leads" style={{ textAlign: 'right' }}>{r.leads ? <Link className="link" href={`/admin/leads?q=${encodeURIComponent(r.name)}`}>{r.leads}</Link> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
