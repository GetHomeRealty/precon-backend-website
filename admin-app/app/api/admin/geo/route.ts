// GET /api/admin/geo?url=<Google Maps link>&lat=&lng=&location=&city=
// → { lat, lng, source, note? } — the pin a pasted map link points at, for the admin form.
import { requireAdmin } from '@/lib/auth';
import { fail, handle, json } from '@/lib/http';
import { CITY_CENTRES, coordsFromMapsUrl, expandMapsLink, isMapsLink } from '@/lib/geo';

export const dynamic = 'force-dynamic';

const STATE: Record<string, string> = { hyderabad: 'Telangana', visakhapatnam: 'Andhra Pradesh' };

/** Locality centre from OpenStreetMap (only used to place short plus codes); null on any failure. */
async function locality(location: string, city: string) {
  const place = location.split('/')[0].trim();
  if (!place) return null;
  const q = [place, STATE[city.toLowerCase()] || city, 'India'].filter(Boolean).join(', ');
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'property-admin-geocoder/1.0' }, signal: AbortSignal.timeout(8000) });
    const r = (await res.json()) as { lat: string; lon: string }[];
    return r[0] ? { lat: Number(r[0].lat), lng: Number(r[0].lon) } : null;
  } catch { return null; }
}

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const sp = new URL(req.url).searchParams;
    const link = (sp.get('url') || '').trim();
    if (!isMapsLink(link)) return fail(400, 'Paste a Google Maps link (maps.app.goo.gl/… or google.com/maps/…).');
    const full = await expandMapsLink(link);
    const city = (sp.get('city') || '').trim(), location = (sp.get('location') || '').trim();
    const pin = { lat: Number(sp.get('lat')), lng: Number(sp.get('lng')) };
    const centre = CITY_CENTRES[city.toLowerCase()] || null;
    // Short plus codes repeat every 1°, so they need a nearby reference: the locality, else the current pin, else the city.
    let c = coordsFromMapsUrl(full, null);
    if (!c) {
      // Place names repeat (there is a Kollur near Hyderabad and another in Nizamabad), so a reference
      // more than 100 km from the project's city is ignored.
      const near = (p: { lat: number; lng: number } | null) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
        && (p.lat !== 0 || p.lng !== 0) && (!centre || km(centre, p) <= 100);
      const loc = await locality(location, city);
      const ref = near(loc) ? loc : near(pin) ? pin : centre;
      c = coordsFromMapsUrl(full, ref);
    }
    if (!c) return fail(422, 'That link has no coordinates Google shares (it names a place only). Open it, tap the pin, and paste the numbers shown into Latitude / Longitude.');
    const far = centre ? km(centre, c) : 0;
    const note = far > 80 ? `This point is ${Math.round(far)} km from ${city} — please check the link.` : undefined;
    return json({ ...c, note });
  } catch (e) {
    if (e instanceof Error && /redirect|Google|link/i.test(e.message)) return fail(422, e.message);
    if (e instanceof Error && /timeout|aborted/i.test(e.name + e.message)) return fail(504, 'Google Maps did not answer in time — try again.');
    return handle(e);
  }
}
