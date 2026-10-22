// GET /api/auth/status — lets the public site show admin shortcuts ("Add project")
// to a signed-in admin. Reveals only whether this browser has a valid session.
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  return Response.json({ signedIn: !!s }, { headers: { 'Cache-Control': 'private, no-store' } });
}
