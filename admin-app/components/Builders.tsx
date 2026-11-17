'use client';
// Builder Management: builder list, add/edit builder, builder profile (details,
// contract agreement, projects) and the add/edit project dialog. Internal only.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, Download, Eye, FileText, Handshake, Mail, MapPin, Pencil, Phone, Plus, Save, Search, Trash2, Upload, User, X,
} from 'lucide-react';
import { api, ApiError } from './api';
import { Confirm, FieldWrap, fmtDate, useToast, useUnsavedWarning } from './ui';
import { useRole } from './AdminShell';
import {
  AGREEMENT_MAX_BYTES, AGREEMENT_STATUS, LOAN_INCLUDED, PROJECT_STATUS, agreementLabel, agreementTone, fmtDay, fmtRupees, fmtRupeesShort,
  includedLabel, isPastDay, loanBreakdown, parsePct, parseRupees, projectLabel, projectTone,
} from '@/lib/builder-options';

type Row = Record<string, any>;
type Errors = Record<string, string>;

const dash = <span className="muted">—</span>;
const agreementUrl = (id: number, download = false) => `/api/admin/builders/${id}/agreement${download ? '?download=1' : ''}`;

function AgreementBadge({ b }: { b: Row }) {
  const lapsed = b.agreement_status === 'completed' && isPastDay(b.agreement_expiry);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span className={`badge ${agreementTone(b.agreement_status)}`}>{agreementLabel(b.agreement_status)}</span>
      {lapsed && <span className="sub" style={{ color: 'var(--accent)' }}>Expiry date passed</span>}
    </span>
  );
}

/** Upload the agreement PDF (multipart); returns the updated builder. */
async function uploadAgreement(id: number, file: File) {
  const form = new FormData();
  form.append('file', file);
  return api<Row>(`/api/admin/builders/${id}/agreement`, { method: 'POST', form });
}

function checkPdf(file: File): string | null {
  if (file.size > AGREEMENT_MAX_BYTES) return 'The PDF is larger than 20 MB.';
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return 'Choose a PDF file.';
  return null;
}

/** Click-or-drop PDF picker. */
function PdfDrop({ onFile, label = 'Upload agreement (PDF)' }: { onFile: (f: File) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className={`drop ${over ? 'over' : ''}`} role="button" tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}>
      <Upload size={20} />
      <div><b>{label}</b> or drag it here</div>
      <div className="hint">PDF only, up to 20 MB. Only signed-in admins can open it.</div>
      <input ref={input} type="file" accept="application/pdf,.pdf"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}

/* =====================================================================
   Builder list
   ===================================================================== */
export function BuilderList() {
  const router = useRouter();
  const sp = useSearchParams();
  const [data, setData] = useState<{ items: Row[]; locations: string[]; counts: Record<string, number> } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState(sp.get('q') || '');
  const [askImport, setAskImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const query = sp.toString();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api(`/api/admin/builders?${query}`)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const setParam = useCallback((k: string, v: string) => {
    const p = new URLSearchParams(window.location.search);
    if (v) p.set(k, v); else p.delete(k);
    router.replace(`/admin/builders${p.toString() ? `?${p}` : ''}`, { scroll: false });
  }, [router]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => setParam('q', qText.trim()), 300);
    return () => clearTimeout(t);
  }, [qText, setParam]);

  async function runImport() {
    setImporting(true);
    try {
      const r = await api<{ builders: number; projects: number; withPhone: number }>('/api/admin/builders/import', { method: 'POST' });
      toast(r.projects || r.builders
        ? `Imported ${r.projects} project${r.projects === 1 ? '' : 's'} (${r.withPhone} with a contact number) and ${r.builders} new builder${r.builders === 1 ? '' : 's'}`
        : 'Everything is already imported — no new website projects.');
      setAskImport(false); load();
    } catch (e) { toast((e as Error).message, 'err'); }
    finally { setImporting(false); }
  }

  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const status = sp.get('status') || '';
  const filtered = !!(sp.get('q') || sp.get('location') || status);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Builders</h1>
          <p>Builders you work with, their contract agreements and their projects. Internal only — nothing here appears on the website.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setAskImport(true)}><Download size={16} />Import website projects</button>
          <Link className="btn btn-primary" href="/admin/builders/new"><Plus size={16} />Add Builder</Link>
        </div>
      </div>

      <div className="status-pills" style={{ marginBottom: 14 }} role="group" aria-label="Agreement status">
        <button className={!status ? 'on' : ''} onClick={() => setParam('status', '')}>All ({total})</button>
        {AGREEMENT_STATUS.map((s) => (
          <button key={s.value} className={status === s.value ? 'on' : ''} onClick={() => setParam('status', s.value)}>
            {s.label} ({data?.counts[s.value] ?? 0})
          </button>
        ))}
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="search"><Search size={16} />
            <input className="input" placeholder="Search builder, contact, email or phone…" value={qText} onChange={(e) => setQText(e.target.value)} aria-label="Search builders" />
          </div>
          <select className="select" style={{ width: 'auto', minWidth: 170 }} value={sp.get('location') || ''} onChange={(e) => setParam('location', e.target.value)} aria-label="Location">
            <option value="">All locations</option>
            {data?.locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className="select" style={{ width: 'auto', minWidth: 190 }} value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Agreement status">
            <option value="">All agreement statuses</option>
            {AGREEMENT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {filtered && <button className="btn btn-ghost btn-sm" onClick={() => { setQText(''); router.replace('/admin/builders', { scroll: false }); }}><X size={14} />Clear</button>}
        </div>

        {error && <div className="card-body"><div className="alert err">{error}</div></div>}
        <div className="table-wrap">
          <table className="tbl stack tbl-tight">
            <thead><tr>
              <th>Builder name</th><th>Location</th><th>Contact person</th><th>Email address</th><th>Phone number</th>
              <th>Agreement status</th><th className="num">Projects</th><th className="num">Actions</th>
            </tr></thead>
            <tbody>
              {loading && !data && [0, 1, 2, 3].map((i) => (
                <tr key={i}>{[0, 1, 2, 3, 4, 5, 6, 7].map((j) => <td key={j}><div className="skeleton" style={{ width: j === 0 ? 160 : 80 }} /></td>)}</tr>
              ))}
              {data?.items.map((b) => (
                <tr key={b.id} style={{ opacity: loading ? 0.6 : 1 }}>
                  <td className="title-cell" style={{ minWidth: 150 }}><Link href={`/admin/builders/${b.id}`}>{b.name}</Link></td>
                  <td data-label="Location">{b.location || dash}</td>
                  <td data-label="Contact">{b.contact_person || dash}</td>
                  <td data-label="Email">{b.email ? <a href={`mailto:${b.email}`}>{b.email}</a> : dash}</td>
                  <td data-label="Phone" style={{ whiteSpace: 'nowrap' }}>{b.phone ? <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a> : dash}</td>
                  <td data-label="Agreement"><AgreementBadge b={b} /></td>
                  <td data-label="Projects" className="num">
                    <span style={{ fontWeight: 600 }}>{b.projects}</span>
                    {b.projects > 0 && <div className="sub" style={{ whiteSpace: 'nowrap', lineHeight: 1.35 }}>
                      {[b.ongoing && `${b.ongoing} ongoing`, b.upcoming && `${b.upcoming} upcoming`, b.completed && `${b.completed} completed`].filter(Boolean).map((t) => <div key={t as string}>{t}</div>)}
                    </div>}
                  </td>
                  <td className="c-actions">
                    <div className="row-actions">
                      <Link className="icon-btn" title="View builder" aria-label={`View ${b.name}`} href={`/admin/builders/${b.id}`}><Eye size={16} /></Link>
                      <Link className="icon-btn" title="Edit builder" aria-label={`Edit ${b.name}`} href={`/admin/builders/${b.id}/edit`}><Pencil size={16} /></Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.items.length && (
          <div className="empty"><Handshake size={32} />
            <div>{filtered ? 'No builders match these filters.' : 'No builders yet.'}</div>
            {!filtered && <Link className="btn btn-primary btn-sm" style={{ marginTop: 12 }} href="/admin/builders/new"><Plus size={14} />Add the first builder</Link>}
          </div>
        )}
        {data && data.items.length > 0 && <div className="pager"><span>{data.items.length} builder{data.items.length === 1 ? '' : 's'}{filtered ? ` (of ${total})` : ''}</span></div>}
      </section>

      <Confirm open={askImport} busy={importing} title="Import projects from the website?" confirmLabel="Import"
        body="Each project in Website content → Projects is added under its builder, with its location and contact number. Builders that don’t exist yet are created. Projects already imported are skipped and nothing you entered is changed."
        onConfirm={runImport} onCancel={() => setAskImport(false)} />
    </>
  );
}

/* =====================================================================
   Add / edit builder
   ===================================================================== */
const EMPTY_BUILDER = {
  name: '', location: '', contact_person: '', phone: '', email: '',
  agreement_status: 'not_initiated', agreement_date: '', agreement_expiry: '', notes: '',
};

export function BuilderForm({ id }: { id: number | 'new' }) {
  const isNew = id === 'new';
  const router = useRouter();
  const toast = useToast();
  const [rec, setRec] = useState<Row | null>(isNew ? { ...EMPTY_BUILDER } : null);
  const [orig, setOrig] = useState<Row | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Row[]>([]);
  const [project, setProject] = useState<Row | null>(null);
  const [delProject, setDelProject] = useState<Row | null>(null);
  const [busyDel, setBusyDel] = useState(false);
  const tmpId = useRef(0);

  const loadProjects = useCallback(async () => {
    if (isNew) return;
    try { setProjects((await api<Row>(`/api/admin/builders/${id}`)).projects || []); }
    catch (e) { toast((e as Error).message, 'err'); }
  }, [id, isNew, toast]);

  useEffect(() => {
    if (isNew) return;
    api<Row>(`/api/admin/builders/${id}`).then((b) => {
      const r = Object.fromEntries(Object.keys(EMPTY_BUILDER).map((k) => [k, b[k] ?? '']));
      setRec(r); setOrig(b); setProjects(b.projects || []);
    }).catch((e) => setError((e as Error).message));
  }, [id, isNew]);

  async function confirmDeleteProject() {
    if (!delProject) return;
    if (delProject.pending) { setProjects((l) => l.filter((x) => x.id !== delProject.id)); setDelProject(null); return; }
    setBusyDel(true);
    try { await api(`/api/admin/builders/${id}/projects/${delProject.id}`, { method: 'DELETE' }); toast('Project deleted'); setDelProject(null); loadProjects(); }
    catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusyDel(false); }
  }

  const dirty = projects.some((p) => p.pending) || !!file || (rec && (isNew ? Object.entries(rec).some(([k, v]) => v !== (EMPTY_BUILDER as Row)[k])
    : orig && Object.keys(EMPTY_BUILDER).some((k) => (rec[k] ?? '') !== (orig[k] ?? ''))));
  useUnsavedWarning(!!dirty && !saving);

  if (error && !rec) return <div className="alert err">{error}</div>;
  if (!rec) return <div className="loading-block"><span className="spinner" /></div>;

  const set = (k: string, v: string) => { setRec((r) => ({ ...r!, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const input = (k: string, label: string, opts: { type?: string; required?: boolean; span?: string; placeholder?: string; auto?: string } = {}) => (
    <FieldWrap label={label} required={opts.required} error={errors[k]} className={opts.span || 'span-3'} htmlFor={`b-${k}`}>
      <input id={`b-${k}`} className={`input ${errors[k] ? 'invalid' : ''}`} type={opts.type || 'text'} value={rec[k] ?? ''}
        placeholder={opts.placeholder} autoComplete={opts.auto || 'off'} maxLength={k === 'phone' ? 40 : 200}
        onChange={(e) => set(k, e.target.value)} />
    </FieldWrap>
  );

  function pick(f: File) {
    const problem = checkPdf(f);
    if (problem) { setErrors((e) => ({ ...e, agreement_file: problem })); return; }
    setErrors((e) => ({ ...e, agreement_file: '' })); setFile(f);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!rec!.name.trim()) { setErrors({ name: 'Enter the builder name.' }); return; }
    setSaving(true); setError(''); setErrors({});
    let savedId = isNew ? 0 : (id as number);
    try {
      const b = await api<Row>(isNew ? '/api/admin/builders' : `/api/admin/builders/${id}`, { method: isNew ? 'POST' : 'PATCH', body: rec });
      savedId = b.id;
      // Projects added while creating the builder are saved now.
      const failed: string[] = [];
      for (const p of projects.filter((x) => x.pending)) {
        const { id: _tmp, pending: _p, ...body } = p;
        try { await api(`/api/admin/builders/${b.id}/projects`, { method: 'POST', body }); }
        catch (pe) { failed.push(`${p.name} (${(pe as Error).message})`); }
      }
      if (failed.length) toast(`Builder saved, but ${failed.length} project${failed.length === 1 ? '' : 's'} could not be added: ${failed.join('; ')}`, 'err');
      if (file) {
        try { await uploadAgreement(b.id, file); }
        catch (up) {
          toast(`Builder saved, but the agreement upload failed: ${(up as Error).message}`, 'err');
          router.push(`/admin/builders/${b.id}`); router.refresh();
          return;
        }
      }
      toast(isNew ? 'Builder added' : 'Builder updated');
      router.push(`/admin/builders/${savedId}`); router.refresh();
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setError(err.message); } else setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/admin/builders">Builders</Link><span>/</span>
            {isNew ? <span>Add builder</span> : <><Link href={`/admin/builders/${id}`}>{orig?.name}</Link><span>/</span><span>Edit</span></>}</div>
          <h1>{isNew ? 'Add Builder' : `Edit ${orig?.name || 'builder'}`}</h1>
          <p>Contact details, contract agreement, projects and notes.</p>
        </div>
      </div>

      {error && <div className="alert err" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <section className="card">
        <div className="card-head"><h2>Builder details</h2></div>
        <div className="card-body">
          <div className="form-grid">
            {input('name', 'Builder name', { required: true, placeholder: 'e.g. Aparna Constructions', span: 'span-3', auto: 'organization' })}
            {input('location', 'Builder location', { placeholder: 'e.g. Hyderabad', span: 'span-3' })}
            {input('contact_person', 'Contact person name', { span: 'span-2', auto: 'name' })}
            {input('phone', 'Contact number', { type: 'tel', placeholder: '+91 98765 43210', span: 'span-2', auto: 'tel' })}
            {input('email', 'Email address', { type: 'email', placeholder: 'name@builder.com', span: 'span-2', auto: 'email' })}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Contract agreement</h2><p>The PDF is stored privately — only signed-in admins can open it.</p></div></div>
        <div className="card-body">
          <div className="form-grid">
            <FieldWrap label="Contract agreement status" required className="span-2" htmlFor="b-status" error={errors.agreement_status}>
              <select id="b-status" className="select" value={rec.agreement_status} onChange={(e) => set('agreement_status', e.target.value)}>
                {AGREEMENT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FieldWrap>
            {input('agreement_date', 'Agreement date', { type: 'date', span: 'span-2' })}
            {input('agreement_expiry', 'Expiry date (if applicable)', { type: 'date', span: 'span-2' })}
            <FieldWrap label="Agreement document (PDF)" className="span-6" error={errors.agreement_file}>
              {file ? (
                <div className="pdf-chip"><FileText size={20} color="var(--accent)" /><span className="grow">{file.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{(file.size / 1024 / 1024).toFixed(1)} MB · uploads when you save</span>
                  <button type="button" className="icon-btn" title="Remove" aria-label="Remove chosen file" onClick={() => setFile(null)}><X size={16} /></button>
                </div>
              ) : orig?.has_agreement ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="pdf-chip"><FileText size={20} color="var(--accent)" /><span className="grow">{orig.agreement_file_name || 'Agreement.pdf'}</span>
                    <a className="btn btn-sm" href={agreementUrl(orig.id)} target="_blank" rel="noreferrer"><Eye size={14} />View</a>
                  </div>
                  <PdfDrop onFile={pick} label="Replace with a new PDF" />
                </div>
              ) : <PdfDrop onFile={pick} />}
            </FieldWrap>
          </div>
        </div>
      </section>

      <ProjectsCard projects={projects} onAdd={(status) => setProject({ status })} onEdit={setProject} onDelete={setDelProject}
        note={isNew ? 'Add the builder’s ongoing, upcoming and completed projects — they are saved together with the builder.' : 'Changes to projects are saved straight away.'} />

      <section className="card">
        <div className="card-head"><h2>Additional notes</h2></div>
        <div className="card-body">
          <FieldWrap label="Notes" htmlFor="b-notes" error={errors.notes} help="Commission terms, payment schedule, who to follow up with…">
            <textarea id="b-notes" className="textarea" rows={5} maxLength={10000} value={rec.notes} onChange={(e) => set('notes', e.target.value)} />
          </FieldWrap>
        </div>
      </section>

      <div className="savebar">
        <span className="note">{dirty ? 'Unsaved changes' : orig?.updated_at ? `Last saved ${fmtDate(orig.updated_at)}` : ''}</span>
        <Link className="btn" href={isNew ? '/admin/builders' : `/admin/builders/${id}`}>Cancel</Link>
        <button className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : <Save size={16} />}{isNew ? 'Add builder' : 'Save changes'}</button>
      </div>

      {project && <ProjectDialog builderId={isNew ? null : (id as number)} builder={rec} project={project} onClose={() => setProject(null)}
        onSaved={(msg) => { setProject(null); toast(msg); loadProjects(); }}
        onLocal={isNew ? (p) => {
          setProjects((l) => p.id ? l.map((x) => (x.id === p.id ? { ...p, pending: true } : x)) : [...l, { ...p, id: `new-${++tmpId.current}`, pending: true }]);
          setProject(null);
        } : undefined} />}
      <Confirm open={!!delProject} busy={busyDel} title="Delete this project?"
        body={<>“{delProject?.name}” will be removed from this builder’s projects.</>}
        onConfirm={confirmDeleteProject} onCancel={() => setDelProject(null)} />
    </form>
  );
}

/* =====================================================================
   Builder profile
   ===================================================================== */
export function BuilderProfile({ id }: { id: number }) {
  const router = useRouter();
  const toast = useToast();
  const role = useRole();
  const [b, setB] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [askDel, setAskDel] = useState(false);
  const [askDoc, setAskDoc] = useState(false);
  const [project, setProject] = useState<Row | null>(null);
  const [delProject, setDelProject] = useState<Row | null>(null);

  const load = useCallback(async () => {
    try { setB(await api<Row>(`/api/admin/builders/${id}`)); }
    catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error && !b) return <div className="alert err">{error}</div>;
  if (!b) return <div className="loading-block"><span className="spinner" /></div>;

  async function patch(body: Row, msg: string) {
    setBusy('status');
    try { setB(await api<Row>(`/api/admin/builders/${id}`, { method: 'PATCH', body })); toast(msg); }
    catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(''); }
  }

  async function upload(f: File) {
    const problem = checkPdf(f);
    if (problem) { toast(problem, 'err'); return; }
    setBusy('upload');
    try { setB(await uploadAgreement(id, f)); toast('Agreement uploaded'); }
    catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(''); }
  }

  async function removeDoc() {
    setBusy('doc');
    try { setB(await api<Row>(`/api/admin/builders/${id}/agreement`, { method: 'DELETE' })); toast('Agreement document removed'); setAskDoc(false); }
    catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(''); }
  }

  async function removeBuilder() {
    setBusy('delete');
    try { await api(`/api/admin/builders/${id}`, { method: 'DELETE' }); toast('Builder deleted'); router.replace('/admin/builders'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); setBusy(''); }
  }

  async function removeProject() {
    if (!delProject) return;
    setBusy('project');
    try { await api(`/api/admin/builders/${id}/projects/${delProject.id}`, { method: 'DELETE' }); toast('Project deleted'); setDelProject(null); load(); }
    catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(''); }
  }

  const projects: Row[] = b.projects || [];
  const tel = b.phone ? `tel:${String(b.phone).replace(/[^\d+]/g, '')}` : '';
  const lapsed = b.agreement_status === 'completed' && isPastDay(b.agreement_expiry);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/admin/builders">Builders</Link><span>/</span><span>{b.name}</span></div>
          <h1>{b.name}</h1>
          <p>{b.location ? <><MapPin size={13} style={{ verticalAlign: '-2px' }} /> {b.location} · </> : null}
            {projects.length} project{projects.length === 1 ? '' : 's'} · Added {fmtDate(b.created_at)}</p>
        </div>
        <div className="actions">
          {tel && <a className="btn" href={tel}><Phone size={16} />Call</a>}
          {b.email && <a className="btn" href={`mailto:${b.email}`}><Mail size={16} />Email</a>}
          <Link className="btn" href={`/admin/builders/${id}/edit`}><Pencil size={16} />Edit builder</Link>
          {role === 'admin' && <button className="btn btn-danger" onClick={() => setAskDel(true)}><Trash2 size={16} />Delete</button>}
        </div>
      </div>

      <div className="form-layout">
        <div>
          {/* A. Builder details */}
          <section className="card" id="details">
            <div className="card-head"><h2>Builder details</h2>
              <Link className="btn btn-sm" href={`/admin/builders/${id}/edit`}><Pencil size={14} />Edit</Link></div>
            <div className="card-body">
              <dl className="kv">
                <dt>Builder name</dt><dd>{b.name}</dd>
                <dt>Location</dt><dd>{b.location || dash}</dd>
                <dt>Contact person</dt><dd>{b.contact_person || dash}</dd>
                <dt>Phone number</dt><dd>{b.phone ? <a className="link-red" href={tel}>{b.phone}</a> : dash}</dd>
                <dt>Email address</dt><dd>{b.email ? <a className="link-red" href={`mailto:${b.email}`}>{b.email}</a> : dash}</dd>
              </dl>
              {b.notes && <>
                <h3 className="section-title" style={{ marginTop: 22 }}>Additional notes</h3>
                <div className="msg">{b.notes}</div>
              </>}
            </div>
          </section>

          {/* C. Builder projects */}
          <ProjectsCard projects={projects} onAdd={(status) => setProject({ status })} onEdit={setProject} onDelete={setDelProject} />
        </div>

        {/* B. Contract agreements */}
        <aside className="aside">
          <section className="card" id="agreement">
            <div className="card-head"><h2>Contract agreement</h2><span className={`badge ${agreementTone(b.agreement_status)}`}>{agreementLabel(b.agreement_status)}</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {lapsed && <div className="alert err" style={{ fontSize: 13 }}>The expiry date ({fmtDay(b.agreement_expiry)}) has passed. Renew the agreement or mark it Expired.</div>}
              <div>
                <div className="section-title" style={{ marginBottom: 8 }}>Update status</div>
                <div className="status-pills">
                  {AGREEMENT_STATUS.map((s) => (
                    <button key={s.value} className={b.agreement_status === s.value ? 'on' : ''} disabled={!!busy}
                      onClick={() => b.agreement_status !== s.value && patch({ agreement_status: s.value }, `Agreement status: ${s.label}`)}>{s.label}</button>
                  ))}
                </div>
              </div>
              <dl className="kv kv-tight">
                <dt>Agreement date</dt><dd>{fmtDay(b.agreement_date) || dash}</dd>
                <dt>Expiry date</dt><dd>{fmtDay(b.agreement_expiry) || dash}</dd>
              </dl>
              <AgreementDates b={b} busy={!!busy} onSave={(body) => patch(body, 'Agreement dates saved')} />
              <div>
                <div className="section-title" style={{ marginBottom: 8 }}>Agreement document</div>
                {b.has_agreement ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="pdf-chip"><FileText size={20} color="var(--accent)" />
                      <span className="grow" title={b.agreement_file_name || ''}>{b.agreement_file_name || 'Agreement.pdf'}</span></div>
                    {b.agreement_uploaded_at && <span className="muted" style={{ fontSize: 12 }}>Uploaded {fmtDate(b.agreement_uploaded_at)}</span>}
                    <div className="actions">
                      <a className="btn btn-sm" href={agreementUrl(id)} target="_blank" rel="noreferrer"><Eye size={14} />View</a>
                      <a className="btn btn-sm" href={agreementUrl(id, true)}><Download size={14} />Download</a>
                      <button className="btn btn-sm btn-danger" onClick={() => setAskDoc(true)} disabled={!!busy}><Trash2 size={14} />Remove</button>
                    </div>
                    {busy === 'upload' ? <div className="loading-block" style={{ padding: 16 }}><span className="spinner" /></div>
                      : <PdfDrop onFile={upload} label="Replace PDF" />}
                  </div>
                ) : busy === 'upload' ? <div className="loading-block" style={{ padding: 16 }}><span className="spinner" /></div>
                  : <PdfDrop onFile={upload} />}
              </div>
            </div>
          </section>
        </aside>
      </div>

      {project && <ProjectDialog builderId={id} builder={b} project={project} onClose={() => setProject(null)}
        onSaved={(msg) => { setProject(null); toast(msg); load(); }} />}

      <Confirm open={askDel} busy={busy === 'delete'} title="Delete this builder?"
        body={<>“{b.name}”, its {projects.length} project{projects.length === 1 ? '' : 's'} and the agreement document will be permanently removed.</>}
        onConfirm={removeBuilder} onCancel={() => setAskDel(false)} />
      <Confirm open={askDoc} busy={busy === 'doc'} title="Remove the agreement document?" confirmLabel="Remove"
        body="The PDF will be permanently deleted. The agreement status and dates stay as they are."
        onConfirm={removeDoc} onCancel={() => setAskDoc(false)} />
      <Confirm open={!!delProject} busy={busy === 'project'} title="Delete this project?"
        body={<>“{delProject?.name}” will be removed from {b.name}’s projects.</>}
        onConfirm={removeProject} onCancel={() => setDelProject(null)} />
    </>
  );
}

/** Inline editor for the agreement / expiry dates on the profile. */
function AgreementDates({ b, busy, onSave }: { b: Row; busy: boolean; onSave: (body: Row) => void }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ agreement_date: b.agreement_date || '', agreement_expiry: b.agreement_expiry || '' });
  useEffect(() => { setD({ agreement_date: b.agreement_date || '', agreement_expiry: b.agreement_expiry || '' }); }, [b.agreement_date, b.agreement_expiry]);
  const bad = d.agreement_date && d.agreement_expiry && d.agreement_expiry < d.agreement_date;
  if (!open) return <div><button className="btn btn-sm" onClick={() => setOpen(true)}><Pencil size={14} />Change dates</button></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FieldWrap label="Agreement date" htmlFor="ad-date">
        <input id="ad-date" type="date" className="input" value={d.agreement_date} onChange={(e) => setD({ ...d, agreement_date: e.target.value })} />
      </FieldWrap>
      <FieldWrap label="Expiry date (if applicable)" htmlFor="ad-exp" error={bad ? 'The expiry date must be after the agreement date.' : ''}>
        <input id="ad-exp" type="date" className={`input ${bad ? 'invalid' : ''}`} value={d.agreement_expiry} onChange={(e) => setD({ ...d, agreement_expiry: e.target.value })} />
      </FieldWrap>
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={busy || !!bad} onClick={() => { onSave(d); setOpen(false); }}>Save dates</button>
        <button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/* =====================================================================
   Projects card (profile + edit page): grouped Ongoing / Upcoming / Completed
   ===================================================================== */
function ProjectsCard({ projects, onAdd, onEdit, onDelete, note }: {
  projects: Row[]; onAdd: (status: string) => void; onEdit: (p: Row) => void; onDelete: (p: Row) => void; note?: string;
}) {
  return (
    <section className="card" id="projects">
      <div className="card-head">
        <div><h2>Builder projects</h2><p>{note || (projects.length ? `${projects.length} project${projects.length === 1 ? '' : 's'} with this builder.` : 'No projects added yet.')}</p></div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAdd('ongoing')}><Plus size={14} />Add Project</button>
      </div>
      <div className="card-body bp-groups">
        {PROJECT_STATUS.map((s) => {
          const list = projects.filter((p) => p.status === s.value);
          return (
            <div key={s.value} className="bp-group">
              <h3 className="section-title">{s.label} projects <span className="bp-count">{list.length}</span>
                <button type="button" className="btn btn-ghost btn-sm bp-add" onClick={() => onAdd(s.value)}><Plus size={14} />Add {s.label.toLowerCase()} project</button></h3>
              {list.length ? (
                <div className="bp-list">
                  {list.map((p) => (
                    <article key={p.id} className="bp-item">
                      <div className="bp-top">
                        <div className="bp-name">{p.name}</div>
                        <span className={`badge ${projectTone(p.status)}`}>{projectLabel(p.status)}</span>
                        {p.pending && <span className="badge warn plain">Saves with the builder</span>}
                        <div className="bp-ctl">
                          <button type="button" className="icon-btn" title="Edit project" aria-label={`Edit ${p.name}`} onClick={() => onEdit(p)}><Pencil size={15} /></button>
                          <button type="button" className="icon-btn" title="Delete project" aria-label={`Delete ${p.name}`} onClick={() => onDelete(p)}><Trash2 size={15} /></button>
                        </div>
                      </div>
                      <div className="bp-meta">
                        <span><MapPin size={13} />{p.location || <span className="muted">Location not set</span>}</span>
                        {p.contact_person && <span><User size={13} />{p.contact_person}</span>}
                        {p.contact_phone ? <a className="bp-phone" href={`tel:${String(p.contact_phone).replace(/[^\d+]/g, '')}`}><Phone size={13} />{p.contact_phone}</a>
                          : <span className="muted"><Phone size={13} />No contact number</span>}
                        {p.contact_email && <a href={`mailto:${p.contact_email}`}><Mail size={13} />{p.contact_email}</a>}
                      </div>
                      {p.description && <p className="bp-desc">{p.description}</p>}
                      <ProjectPrices p={p} />
                      {p.website_slug && <div className="bp-meta">{p.website_published
                        ? <a href={`/projects/${p.website_slug}`} target="_blank" rel="noreferrer"><Eye size={13} />View on website</a>
                        : <Link href={`/admin/projects/${p.project_id}`}><Eye size={13} />Website listing (draft)</Link>}</div>}
                    </article>
                  ))}
                </div>
              ) : <p className="muted bp-none">No {s.label.toLowerCase()} projects.</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** What a loan price includes: ticked options (with % and amount) + the "other" note. */
function loanIncluded(x: Row) {
  const { lines, charges, total } = loanBreakdown(x.base_price, Array.isArray(x.included) ? x.included : [], x.rates || {});
  const chips = lines.map((l) => ({
    key: l.value,
    text: includedLabel(l.value) + (l.pct !== null ? ` ${l.pct}%` : ''),
    amount: l.amount !== null ? fmtRupees(l.amount) : '',
  }));
  const extra = [typeof x.included === 'string' ? x.included : '', x.included_note].filter((t) => typeof t === 'string' && t.trim());
  extra.forEach((t, i) => chips.push({ key: `note-${i}`, text: String(t).trim(), amount: '' }));
  return { chips, charges, total };
}

/** OTP and loan prices on a project card. */
function ProjectPrices({ p }: { p: Row }) {
  const otp: Row[] = Array.isArray(p.otp_prices) ? p.otp_prices : [];
  const loan: Row[] = Array.isArray(p.loan_prices) ? p.loan_prices : [];
  if (!otp.length && !loan.length) return null;
  return (
    <div className="bp-prices">
      {otp.length > 0 && (
        <div className="bp-price-box">
          <div className="bp-price-head">OTP prices <span className="muted">(one-time payment)</span></div>
          <table><tbody>
            {otp.map((x, i) => (
              <tr key={i}><td>{x.description}</td><td className="bp-amt">{fmtRupees(x.price)}<span className="muted"> · {fmtRupeesShort(x.price)}</span></td></tr>
            ))}
          </tbody></table>
        </div>
      )}
      {loan.length > 0 && (
        <div className="bp-price-box">
          <div className="bp-price-head">Loan prices <span className="muted">(installments)</span></div>
          <table><tbody>
            {loan.map((x, i) => {
              const inc = loanIncluded(x);
              return (
                <tr key={i}><td className="bp-amt">{fmtRupees(x.base_price)}<span className="muted"> · {fmtRupeesShort(x.base_price)}</span><div className="sub">Base price</div>
                  {inc.charges > 0 && inc.total !== null && <div className="bp-total">{fmtRupees(inc.total)}<span className="muted"> · {fmtRupeesShort(inc.total)}</span>
                    <div className="sub">Total with charges</div></div>}</td>
                  <td>{inc.chips.length ? <><div className="sub">Included</div><ul className="bp-inc-lines">{inc.chips.map((c) => (
                    <li key={c.key}><Check size={13} /><span>{c.text}</span>{c.amount && <b>{c.amount}</b>}</li>))}</ul></>
                    : <span className="muted">Nothing included</span>}</td></tr>
              );
            })}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

/** Editable rows of prices inside the project dialog. */
function PriceRows({ kind, rows, errors, onChange }: {
  kind: 'otp' | 'loan'; rows: Row[]; errors: Errors; onChange: (rows: Row[]) => void;
}) {
  const key = kind === 'otp' ? 'otp_prices' : 'loan_prices';
  const amountKey = kind === 'otp' ? 'price' : 'base_price';
  const upd = (i: number, k: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = () => onChange([...rows, kind === 'otp' ? { description: '', price: '' } : { base_price: '', included: [], included_note: '' }]);
  const toggle = (i: number, v: string, on: boolean) => onChange(rows.map((r, j) => {
    if (j !== i) return r;
    const cur: string[] = Array.isArray(r.included) ? r.included : [];
    return { ...r, included: on ? [...cur.filter((x) => x !== v), v] : cur.filter((x) => x !== v) };
  }));
  const setRate = (i: number, v: string, val: string) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, rates: { ...(r.rates || {}), [v]: val } } : r)));
  return (
    <div className="span-6 bp-price-edit">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="section-title" style={{ margin: 0 }}>
          {kind === 'otp' ? 'OTP prices (one-time payment)' : 'Loan prices (installments)'}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={add}>
          <Plus size={14} />{kind === 'otp' ? 'Add OTP price' : 'Add loan price'}</button>
      </div>
      {errors[key] && <span className="err" role="alert">{errors[key]}</span>}
      {!rows.length && <p className="muted bp-none">{kind === 'otp' ? 'No OTP prices added.' : 'No loan prices added.'}</p>}
      {rows.map((r, i) => {
        const amtErr = errors[`${key}.${i}.${amountKey}`];
        const short = fmtRupeesShort(r[amountKey]);
        const amount = (
          <FieldWrap label={kind === 'otp' ? 'Price (₹)' : 'Base price (₹)'} required error={amtErr} help={short || undefined} htmlFor={`${key}-${i}-amt`}>
            <input id={`${key}-${i}-amt`} className={`input ${amtErr ? 'invalid' : ''}`} inputMode="decimal" autoComplete="off" maxLength={20}
              placeholder="e.g. 85,00,000" value={r[amountKey] ?? ''} onChange={(e) => upd(i, amountKey, e.target.value)} />
          </FieldWrap>
        );
        return (
          <div key={i} className={`bp-price-row ${kind}`}>
            {kind === 'otp' ? <>
              <FieldWrap label="Description" required error={errors[`${key}.${i}.description`]} htmlFor={`${key}-${i}-desc`}>
                <input id={`${key}-${i}-desc`} className={`input ${errors[`${key}.${i}.description`] ? 'invalid' : ''}`} maxLength={300} autoComplete="off"
                  placeholder="e.g. 3 BHK, 1,650 sq ft, east facing" value={r.description ?? ''} onChange={(e) => upd(i, 'description', e.target.value)} />
              </FieldWrap>
              {amount}
            </> : <>
              {amount}
              <fieldset className="field bp-inc">
                <legend>Included options</legend>
                <div className="bp-checks">
                  {LOAN_INCLUDED.map((o) => {
                    const on = Array.isArray(r.included) && r.included.includes(o.value);
                    const pctErr = errors[`${key}.${i}.rates.${o.value}`];
                    const pct = parsePct(r.rates?.[o.value]);
                    const base = parseRupees(r.base_price);
                    return (
                      <div key={o.value} className={`bp-check-row ${on ? 'on' : ''}`}>
                        <label className={`bp-check ${on ? 'on' : ''}`}>
                          <input type="checkbox" checked={on} onChange={(e) => toggle(i, o.value, e.target.checked)} />{o.label}
                        </label>
                        {on && <>
                          <span className="bp-pct">
                            <input className={`input ${pctErr ? 'invalid' : ''}`} inputMode="decimal" maxLength={6} autoComplete="off" placeholder="0"
                              aria-label={`${o.label} percentage of base price`} value={r.rates?.[o.value] ?? ''}
                              onChange={(e) => setRate(i, o.value, e.target.value)} />%
                          </span>
                          <span className="bp-calc">{pct !== null && base !== null ? `= ${fmtRupees(Math.round((base * pct) / 100))}` : pct !== null ? 'Enter the base price' : 'Optional'}</span>
                          {pctErr && <span className="err" role="alert">{pctErr}</span>}
                        </>}
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const b = loanBreakdown(r.base_price, Array.isArray(r.included) ? r.included : [], r.rates || {});
                  return b.charges > 0 && b.total !== null ? (
                    <div className="bp-sum">
                      <span>Base price {fmtRupees(parseRupees(r.base_price))} + charges {fmtRupees(b.charges)}</span>
                      <b>Total price {fmtRupees(b.total)} <span className="muted">({fmtRupeesShort(b.total)})</span></b>
                    </div>
                  ) : null;
                })()}
                <input id={`${key}-${i}-inc`} className="input" maxLength={1000} autoComplete="off" aria-label="Other included options"
                  placeholder="Other (optional), e.g. registration, GST" value={r.included_note ?? ''} onChange={(e) => upd(i, 'included_note', e.target.value)} />
                {errors[`${key}.${i}.included`] && <span className="err" role="alert">{errors[`${key}.${i}.included`]}</span>}
                {errors[`${key}.${i}.included_note`] && <span className="err" role="alert">{errors[`${key}.${i}.included_note`]}</span>}
              </fieldset>
            </>}
            <button type="button" className="icon-btn" title="Remove this price" aria-label="Remove this price"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}

/* =====================================================================
   Add / edit project dialog
   ===================================================================== */
const EMPTY_PROJECT = { name: '', location: '', status: 'ongoing', contact_person: '', contact_email: '', contact_phone: '', description: '',
  otp_prices: [] as Row[], loan_prices: [] as Row[] };

/** Check the price rows in the browser so mistakes show next to the field. */
function priceErrors(p: Row): Errors {
  const e: Errors = {};
  (p.otp_prices as Row[]).forEach((r, i) => {
    if (!String(r.description ?? '').trim()) e[`otp_prices.${i}.description`] = 'Enter what this price is for.';
    if (parseRupees(r.price) === null) e[`otp_prices.${i}.price`] = 'Enter the price in rupees.';
  });
  (p.loan_prices as Row[]).forEach((r, i) => {
    if (parseRupees(r.base_price) === null) e[`loan_prices.${i}.base_price`] = 'Enter the base price in rupees.';
    for (const v of (Array.isArray(r.included) ? r.included : []) as string[]) {
      const raw = String(r.rates?.[v] ?? '').trim();
      const n = parsePct(raw);
      if (raw && (n === null || n > 100)) e[`loan_prices.${i}.rates.${v}`] = 'Enter a percentage from 0 to 100.';
    }
  });
  return e;
}

function ProjectDialog({ builderId, builder, project, onClose, onSaved, onLocal }: {
  builderId: number | null; builder: Row; project: Row; onClose: () => void; onSaved: (msg: string) => void;
  /** New builder (not saved yet): hand the project back instead of saving it. */
  onLocal?: (p: Row) => void;
}) {
  const isNew = !project.id;
  const [p, setP] = useState<Row>(() => {
    const init: Row = { ...EMPTY_PROJECT, ...Object.fromEntries(Object.keys(EMPTY_PROJECT).map((k) => [k, project[k] ?? (EMPTY_PROJECT as Row)[k]])) };
    // Saved amounts open as "1,25,00,000" rather than "12500000".
    const grp = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : v ?? '');
    init.otp_prices = (init.otp_prices as Row[]).map((r) => ({ ...r, price: grp(r.price) }));
    // Older rows kept "included" as free text: show it in the "Other" box.
    init.loan_prices = (init.loan_prices as Row[]).map((r) => ({
      ...r, base_price: grp(r.base_price),
      included: Array.isArray(r.included) ? r.included : [],
      included_note: r.included_note ?? (typeof r.included === 'string' ? r.included : ''),
    }));
    return init;
  });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose, saving]);

  const set = (k: string, v: string) => { setP((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const setRows = (k: string, rows: Row[]) => {
    setP((x) => ({ ...x, [k]: rows }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([f]) => f !== k && !f.startsWith(k + '.'))));
  };
  const field = (k: string, label: string, opts: { type?: string; required?: boolean; span?: string; placeholder?: string } = {}): ReactNode => (
    <FieldWrap label={label} required={opts.required} error={errors[k]} className={opts.span || 'span-3'} htmlFor={`p-${k}`}>
      <input id={`p-${k}`} ref={k === 'name' ? first : undefined} className={`input ${errors[k] ? 'invalid' : ''}`} type={opts.type || 'text'}
        value={p[k] ?? ''} placeholder={opts.placeholder} maxLength={k === 'contact_phone' ? 40 : 200} autoComplete="off" onChange={(e) => set(k, e.target.value)} />
    </FieldWrap>
  );

  /** Fill the project contact from the builder's own contact details. */
  const copyContact = () => setP((x) => ({ ...x, contact_person: builder.contact_person || '', contact_email: builder.email || '', contact_phone: builder.phone || '' }));

  async function save(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // the dialog can open from inside the builder form
    if (!p.name.trim()) { setErrors({ name: 'Enter the project name.' }); first.current?.focus(); return; }
    const pe = priceErrors(p);
    if (Object.keys(pe).length) {
      setErrors(pe);
      setTimeout(() => (document.querySelector('.modal .input.invalid') as HTMLInputElement | null)?.focus(), 0);
      return;
    }
    // Amounts are stored as numbers ("85,00,000" → 8500000).
    const clean = {
      ...p, name: p.name.trim(),
      otp_prices: (p.otp_prices as Row[]).map((r) => ({ description: String(r.description).trim(), price: parseRupees(r.price) })),
      loan_prices: (p.loan_prices as Row[]).map((r) => ({
        base_price: parseRupees(r.base_price),
        included: Array.isArray(r.included) ? r.included : [],
        included_note: String(r.included_note ?? '').trim() || null,
        // Only ticked options keep a percentage; blank boxes are left out.
        rates: Object.fromEntries(((Array.isArray(r.included) ? r.included : []) as string[])
          .map((v) => [v, parsePct(r.rates?.[v])]).filter(([, n]) => n !== null)),
      })),
    };
    if (onLocal) { onLocal({ ...project, ...clean }); return; }
    setSaving(true); setError('');
    try {
      await api(isNew ? `/api/admin/builders/${builderId}/projects` : `/api/admin/builders/${builderId}/projects/${project.id}`,
        { method: isNew ? 'POST' : 'PATCH', body: clean });
      onSaved(isNew ? 'Project added' : 'Project updated');
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setError(err.message); } else setError((err as Error).message);
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="pd-title" onSubmit={save} noValidate>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h3 id="pd-title" style={{ margin: 0 }}>{isNew ? 'Add project' : 'Edit project'}</h3>
          <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p style={{ marginBottom: 16 }}>Builder: <b>{builder.name}</b></p>
        {error && <div className="alert err" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-grid">
          {field('name', 'Project name', { required: true, span: 'span-4', placeholder: 'e.g. Aparna Zenon' })}
          <FieldWrap label="Project status" required className="span-2" htmlFor="p-status" error={errors.status}>
            <select id="p-status" className="select" value={p.status} onChange={(e) => set('status', e.target.value)}>
              {PROJECT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </FieldWrap>
          {field('location', 'Project location', { span: 'span-6', placeholder: 'e.g. Kokapet, Hyderabad' })}
          <div className="span-6" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: -8 }}>
            <span className="section-title" style={{ margin: 0 }}>Project contact</span>
            {(builder.contact_person || builder.email || builder.phone) &&
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={copyContact}>Same as builder contact</button>}
          </div>
          {field('contact_person', 'Contact person', { span: 'span-2' })}
          {field('contact_phone', 'Contact phone number', { type: 'tel', span: 'span-2', placeholder: '+91 98765 43210' })}
          {field('contact_email', 'Contact email address', { type: 'email', span: 'span-2' })}
          <FieldWrap label="Project description" className="span-6" htmlFor="p-desc" error={errors.description}>
            <textarea id="p-desc" className="textarea" rows={4} maxLength={10000} value={p.description} onChange={(e) => set('description', e.target.value)} />
          </FieldWrap>
          <PriceRows kind="otp" rows={p.otp_prices} errors={errors} onChange={(rows) => setRows('otp_prices', rows)} />
          <PriceRows kind="loan" rows={p.loan_prices} errors={errors} onChange={(rows) => setRows('loan_prices', rows)} />
        </div>
        <div className="actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : <Save size={16} />}{isNew ? 'Add project' : 'Save project'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
