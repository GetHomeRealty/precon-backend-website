// Private document storage (builder agreements). Unlike lib/storage.ts, nothing here is
// ever reachable by a public URL: files live outside public/ and are streamed only by
// admin API routes that check the session first.
//
//   PRIVATE_UPLOAD_DIR   folder for the files (default: ./.data/private, which is not in git)
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http';
import { AGREEMENT_MAX_BYTES } from './builder-options';

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.PRIVATE_UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), '.data', 'private'));
/** Only keys this module made are ever read or deleted (no path tricks possible). */
const KEY_RE = /^agreements\/\d{4}\/[a-f0-9]{32}\.pdf$/;

function fileOf(key: string) {
  if (!KEY_RE.test(key)) throw new HttpError(404, 'Document not found.');
  const file = path.resolve(ROOT, key);
  if (!file.startsWith(ROOT + path.sep)) throw new HttpError(404, 'Document not found.');
  return file;
}

/** Validate by content (must really be a PDF) and store. Returns the private key. */
export async function savePrivatePdf(buf: Buffer): Promise<string> {
  if (process.env.VERCEL) throw new HttpError(500, 'Private document storage needs a server with a persistent disk.');
  if (buf.length > AGREEMENT_MAX_BYTES) throw new HttpError(413, 'The PDF is larger than 20 MB.');
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(415, 'That file is not a PDF.');
  const key = `agreements/${new Date().getUTCFullYear()}/${crypto.randomBytes(16).toString('hex')}.pdf`;
  const file = fileOf(key);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, buf, { mode: 0o600 });
  return key;
}

export async function readPrivate(key: string): Promise<Buffer> {
  try { return await fs.readFile(fileOf(key)); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(404, 'The document file is missing on the server.'); }
}

export async function deletePrivate(key: string | null | undefined) {
  if (!key) return;
  try { await fs.rm(fileOf(key), { force: true }); } catch (e) { console.error('deletePrivate failed', e); }
}

/** A safe download name: "Agreement - Aparna Constructions.pdf". */
export function downloadName(original: string | null | undefined, builder: string) {
  const clean = (s: string) => s.normalize('NFKD').replace(/[^\w .()-]+/g, '').replace(/\s+/g, ' ').trim();
  const base = clean(String(original || '').replace(/\.pdf$/i, '')).slice(0, 80) || clean(`Agreement - ${builder}`).slice(0, 80) || 'agreement';
  return `${base}.pdf`;
}
