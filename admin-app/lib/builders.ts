// Builder Management — server side: validation and database access.
import { z } from 'zod';
import { one, plain, q, tx, type Row } from './db';
import { HttpError } from './http';
import { AGREEMENT_STATUS, PROJECT_STATUS } from './builder-options';

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Keep it under ${max} characters.`).nullable().optional());
const name = (what: string) => z.string({ error: `Enter the ${what}.` }).trim().min(1, `Enter the ${what}.`).max(200);
const email = z.preprocess(blank, z.string().trim().toLowerCase().max(200).email('Enter a valid email address.').nullable().optional());
const phone = z.preprocess(blank, z.string().trim().max(40)
  .regex(/^\+?[\d\s()./-]{6,}$/, 'Enter a valid phone number.').nullable().optional());
const day = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')
  .refine((d) => !Number.isNaN(Date.parse(d)), 'Pick a date.').nullable().optional());
const values = <T extends readonly { value: string }[]>(list: T) => list.map((o) => o.value) as [string, ...string[]];

export const builderSchema = z.object({
  name: name('builder name'),
  location: text(200),
  contact_person: text(200),
  phone,
  email,
  agreement_status: z.enum(values(AGREEMENT_STATUS), { error: 'Choose an agreement status.' }).optional(),
  agreement_date: day,
  agreement_expiry: day,
  notes: text(10000),
}).refine((b) => !b.agreement_date || !b.agreement_expiry || b.agreement_expiry >= b.agreement_date,
  { message: 'The expiry date must be after the agreement date.', path: ['agreement_expiry'] });

export const projectSchema = z.object({
  name: name('project name'),
  location: text(200),
  status: z.enum(values(PROJECT_STATUS), { error: 'Choose a project status.' }),
  contact_person: text(200),
  contact_email: email,
  contact_phone: phone,
  description: text(10000),
});

const BUILDER_COLS = ['name', 'location', 'contact_person', 'phone', 'email', 'agreement_status', 'agreement_date', 'agreement_expiry', 'notes'];
const PROJECT_COLS = ['name', 'location', 'status', 'contact_person', 'contact_email', 'contact_phone', 'description'];

/** Dates come back as plain "YYYY-MM-DD"; the private file key is never sent to the browser. */
const BUILDER_SELECT = `b.id, b.name, b.location, b.contact_person, b.phone, b.email, b.agreement_status,
  b.agreement_date::text as agreement_date, b.agreement_expiry::text as agreement_expiry,
  (b.agreement_file is not null) as has_agreement, b.agreement_file_name, b.agreement_uploaded_at,
  b.notes, b.created_at, b.updated_at`;

export function parseId(v: string) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw new HttpError(404, 'Not found.');
  return n;
}

export async function listBuilders(opts: { q?: string; location?: string; status?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.q) {
    params.push(`%${opts.q.replace(/[\\%_]/g, (m) => '\\' + m)}%`);
    where.push(`(b.name ilike $${params.length} or b.location ilike $${params.length} or b.contact_person ilike $${params.length}
      or b.email ilike $${params.length} or b.phone ilike $${params.length})`);
  }
  if (opts.location) { params.push(opts.location.toLowerCase()); where.push(`lower(trim(b.location)) = $${params.length}`); }
  if (opts.status) { params.push(opts.status); where.push(`b.agreement_status = $${params.length}`); }
  const rows = await q(
    `select ${BUILDER_SELECT},
            count(p.id)::int as projects,
            count(p.id) filter (where p.status = 'ongoing')::int as ongoing,
            count(p.id) filter (where p.status = 'upcoming')::int as upcoming,
            count(p.id) filter (where p.status = 'completed')::int as completed
       from builders b left join builder_projects p on p.builder_id = b.id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      group by b.id order by lower(b.name), b.id`, params);
  const locations = (await q(
    `select min(trim(location)) as location from builders where coalesce(trim(location), '') <> ''
      group by lower(trim(location)) order by 1`)).map((r) => r.location as string);
  const counts = await q(`select agreement_status as s, count(*)::int as n from builders group by 1`);
  return {
    items: rows.map((r) => plain(r)),
    locations,
    counts: Object.fromEntries(counts.map((r) => [r.s, r.n])) as Record<string, number>,
  };
}

export async function getBuilder(id: number) {
  const b = await one(`select ${BUILDER_SELECT} from builders b where b.id = $1`, [id]);
  if (!b) throw new HttpError(404, 'This builder no longer exists.');
  const projects = await q(
    `select bp.id, bp.name, bp.location, bp.status, bp.contact_person, bp.contact_email, bp.contact_phone, bp.description,
            bp.created_at, bp.updated_at, bp.project_id, p.slug as website_slug, p.is_published as website_published
       from builder_projects bp left join projects p on p.id = bp.project_id
      where bp.builder_id = $1 order by lower(bp.name), bp.id`, [id]);
  return { ...plain(b), projects: projects.map((r) => plain(r)) } as Row & { projects: Row[] };
}

/**
 * Bring the website's projects into Builder Management: one builder per developer name
 * (matched case-insensitively), and one builder project per website project with its
 * location and the contact number saved on it. Safe to run again: projects already
 * imported (linked by project_id) are skipped, nothing existing is overwritten.
 */
export async function importWebsiteProjects(adminId: number) {
  return tx(async (t) => {
    const builders = await t.query(
      `insert into builders (name, location, created_by, updated_by)
       select min(trim(p.developer)), mode() within group (order by p.city), $1, $1
         from projects p
        where coalesce(trim(p.developer), '') <> ''
          and not exists (select 1 from builders b where lower(trim(b.name)) = lower(trim(p.developer)))
        group by lower(trim(p.developer))
       returning id`, [adminId]);
    const projects = await t.query(
      `insert into builder_projects (builder_id, project_id, name, location, status, contact_phone, created_by, updated_by)
       select b.id, p.id, p.name,
              nullif(concat_ws(', ', nullif(trim(p.location), ''), nullif(trim(p.city), '')), ''),
              case when p.status = 'upcoming' then 'upcoming'
                   when p.possession ilike 'ready%' then 'completed' else 'ongoing' end,
              coalesce(nullif(trim(p.extra->>'phoneDisp'), ''), nullif('+' || trim(p.extra->>'phone'), '+')),
              $1, $1
         from projects p
         join lateral (select id from builders b where lower(trim(b.name)) = lower(trim(p.developer)) order by id limit 1) b on true
        where not exists (select 1 from builder_projects bp where bp.project_id = p.id)
       returning id, contact_phone`, [adminId]);
    return {
      builders: builders.length,
      projects: projects.length,
      withPhone: projects.filter((r) => r.contact_phone).length,
    };
  });
}

function assignments(cols: string[], data: Record<string, unknown>, start: number) {
  const keys = cols.filter((c) => c in data);
  return { keys, sets: keys.map((k, i) => `${k} = $${start + i}`), vals: keys.map((k) => data[k] ?? null) };
}

export async function createBuilder(body: unknown, adminId: number) {
  const data = builderSchema.parse(body);
  const keys = BUILDER_COLS.filter((c) => (data as Record<string, unknown>)[c] !== undefined);
  const vals = keys.map((k) => (data as Record<string, unknown>)[k] ?? null);
  const row = await one(
    `insert into builders (${[...keys, 'created_by', 'updated_by'].join(', ')})
     values (${[...keys, 'a', 'b'].map((_, i) => `$${i + 1}`).join(', ')}) returning id`, [...vals, adminId, adminId]);
  return getBuilder(row!.id);
}

/** Partial updates: only the fields sent are changed (e.g. just the agreement status). */
export async function updateBuilder(id: number, body: unknown, adminId: number) {
  const current = await getBuilder(id);
  const merged = builderSchema.parse({ ...pick(current, BUILDER_COLS), ...(body as object) });
  const sent = Object.keys((body ?? {}) as object);
  const data = Object.fromEntries(Object.entries(merged).filter(([k]) => sent.includes(k)));
  const { sets, vals } = assignments(BUILDER_COLS, data, 2);
  if (!sets.length) return current;
  await q(`update builders set ${sets.join(', ')}, updated_at = now(), updated_by = $${vals.length + 2} where id = $1`, [id, ...vals, adminId]);
  return getBuilder(id);
}

export async function setAgreementFile(id: number, key: string | null, fileName: string | null, adminId: number) {
  const old = await one(`select agreement_file from builders where id = $1`, [id]);
  if (!old) throw new HttpError(404, 'This builder no longer exists.');
  await q(`update builders set agreement_file = $2, agreement_file_name = $3, agreement_uploaded_at = case when $2::text is null then null else now() end,
             updated_at = now(), updated_by = $4 where id = $1`, [id, key, fileName, adminId]);
  return old.agreement_file as string | null;
}

export async function agreementKey(id: number) {
  const r = await one(`select name, agreement_file, agreement_file_name from builders where id = $1`, [id]);
  if (!r) throw new HttpError(404, 'This builder no longer exists.');
  if (!r.agreement_file) throw new HttpError(404, 'No agreement document has been uploaded for this builder.');
  return r as { name: string; agreement_file: string; agreement_file_name: string | null };
}

export async function deleteBuilder(id: number) {
  const r = await one(`delete from builders where id = $1 returning name, agreement_file`, [id]);
  if (!r) throw new HttpError(404, 'This builder no longer exists.');
  return r as { name: string; agreement_file: string | null };
}

export async function createProject(builderId: number, body: unknown, adminId: number) {
  await getBuilder(builderId);
  const data = projectSchema.parse(body) as Record<string, unknown>;
  const vals = PROJECT_COLS.map((k) => data[k] ?? null);
  const row = await one(
    `insert into builder_projects (builder_id, ${PROJECT_COLS.join(', ')}, created_by, updated_by)
     values ($1, ${PROJECT_COLS.map((_, i) => `$${i + 2}`).join(', ')}, $${PROJECT_COLS.length + 2}, $${PROJECT_COLS.length + 2})
     returning id, name`, [builderId, ...vals, adminId]);
  return row!;
}

export async function updateProject(builderId: number, id: number, body: unknown, adminId: number) {
  const cur = await one(`select ${PROJECT_COLS.join(', ')} from builder_projects where id = $1 and builder_id = $2`, [id, builderId]);
  if (!cur) throw new HttpError(404, 'This project no longer exists.');
  const merged = projectSchema.parse({ ...cur, ...(body as object) }) as Record<string, unknown>;
  const { sets, vals } = assignments(PROJECT_COLS, merged, 3);
  await q(`update builder_projects set ${sets.join(', ')}, updated_at = now(), updated_by = $${vals.length + 3}
            where id = $1 and builder_id = $2`, [id, builderId, ...vals, adminId]);
  return { id, name: merged.name as string };
}

export async function deleteProject(builderId: number, id: number) {
  const r = await one(`delete from builder_projects where id = $1 and builder_id = $2 returning name`, [id, builderId]);
  if (!r) throw new HttpError(404, 'This project no longer exists.');
  return r.name as string;
}

function pick(o: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
}
