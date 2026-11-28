// Coordinates from a Google Maps link, so a pasted "Map link" and the map pin can't disagree.
// Short links (maps.app.goo.gl) are followed server-side — only ever to Google Maps hosts.

export type Coords = { lat: number; lng: number; source: 'place' | 'coordinates' | 'plus code' | 'viewport' };

const HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+)$/i;

/** True for http(s) links on a Google Maps host. */
export function isMapsLink(u: string): boolean {
  try {
    const x = new URL(u);
    return /^https?:$/.test(x.protocol) && HOSTS.test(x.hostname) && (x.hostname !== 'goo.gl' || x.pathname.startsWith('/maps'));
  } catch { return false; }
}

/** Follows a short link to the full Google Maps URL (at most 5 hops, Google hosts only). */
export async function expandMapsLink(u: string): Promise<string> {
  let url = u;
  for (let hop = 0; hop < 5; hop++) {
    if (!isMapsLink(url)) throw new Error('That link does not lead to Google Maps.');
    if (!/^(maps\.app\.goo\.gl|goo\.gl)$/i.test(new URL(url).hostname)) return url; // already a full maps URL
    const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const next = res.headers.get('location');
    if (!next) throw new Error('Google did not return a location for that link.');
    url = new URL(next, url).toString();
  }
  throw new Error('Too many redirects.');
}

const ok = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Reads coordinates from a full Google Maps URL. `ref` (the record's current pin or its city) is only
 * needed for short plus codes like "6FF9+227", which name a spot relative to a nearby place.
 */
export function coordsFromMapsUrl(raw: string, ref?: { lat: number; lng: number } | null): Coords | null {
  const s = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
  const num = '(-?\\d{1,3}\\.\\d+)';
  // 1. the place's own position (data=…!3d<lat>!4d<lng>) — the pin Google shows
  let m = s.match(new RegExp(`!3d${num}!4d${num}`));
  if (m && ok(+m[1], +m[2])) return { lat: round(+m[1]), lng: round(+m[2]), source: 'place' };
  // 2. explicit coordinates: /place/17.39,78.38 · ?q= · ?query= · ?ll= · ?destination= · ?center=
  m = s.match(new RegExp(`(?:/place/|/search/|[?&](?:q|query|ll|destination|daddr|center)=)${num}\\s*,\\s*\\+?${num}`));
  if (m && ok(+m[1], +m[2])) return { lat: round(+m[1]), lng: round(+m[2]), source: 'coordinates' };
  // 3. a plus code ("7J9VGV5Q+77G" or short "GV5Q+77G"). The "+" may arrive as "+", "%2B" or a space.
  m = raw.match(/(?:^|[/=+\s,])((?:[23456789CFGHJMPQRVWX]{4})?[23456789CFGHJMPQRVWX]{4})(?:\+|%2B)([23456789CFGHJMPQRVWX]{2,3})(?![23456789CFGHJMPQRVWX])/i);
  if (m) {
    const code = `${m[1]}+${m[2]}`.toUpperCase();
    const c = m[1].length === 8 ? decodePlusCode(code) : ref ? recoverPlusCode(code, ref.lat, ref.lng) : null;
    if (c && ok(c.lat, c.lng)) return { lat: round(c.lat), lng: round(c.lng), source: 'plus code' };
  }
  // 4. the map's viewport centre (@lat,lng,zoom) — close to, but not always exactly on, the place
  m = s.match(new RegExp(`@${num},${num}`));
  if (m && ok(+m[1], +m[2])) return { lat: round(+m[1]), lng: round(+m[2]), source: 'viewport' };
  return null;
}

/* ---------- Open Location Code (plus codes), decode only ---------- */
const OLC = '23456789CFGHJMPQRVWX';

/** Centre of a full plus code such as "7J9V6FF9+227". */
export function decodePlusCode(code: string): { lat: number; lng: number } | null {
  const d = code.replace('+', '').replace(/0+$/, '').toUpperCase();
  if (d.length < 8 || [...d].some((ch) => !OLC.includes(ch))) return null;
  let lat = -90, lng = -180, place = 20, latRes = 20, lngRes = 20;
  for (let i = 0; i < Math.min(d.length, 10); i += 2) {
    lat += OLC.indexOf(d[i]) * place;
    lng += OLC.indexOf(d[i + 1] ?? '2') * place;
    latRes = lngRes = place;
    place /= 20;
  }
  for (let i = 10; i < d.length; i++) {   // grid refinement: 5 rows × 4 columns per character
    const v = OLC.indexOf(d[i]);
    latRes /= 5; lngRes /= 4;
    lat += Math.floor(v / 4) * latRes;
    lng += (v % 4) * lngRes;
  }
  return { lat: lat + latRes / 2, lng: lng + lngRes / 2 };
}

/** A short plus code ("6FF9+227"), placed in the cell nearest the reference point. */
export function recoverPlusCode(short: string, refLat: number, refLng: number): { lat: number; lng: number } | null {
  const pad = 8 - short.indexOf('+');               // characters dropped from the front (always even)
  if (pad <= 0 || pad % 2) return decodePlusCode(short);
  const res = Math.pow(20, 2 - pad / 2), half = res / 2;
  let a = refLat + 90, b = refLng + 180, place = 20, prefix = '';
  for (let k = 0; k < pad / 2; k++) {
    const i = Math.floor(a / place), j = Math.floor(b / place);
    prefix += OLC[i] + OLC[j]; a -= i * place; b -= j * place; place /= 20;
  }
  const c = decodePlusCode(prefix + short);
  if (!c) return null;
  if (refLat + half < c.lat) c.lat -= res; else if (refLat - half > c.lat) c.lat += res;
  if (refLng + half < c.lng) c.lng -= res; else if (refLng - half > c.lng) c.lng += res;
  return c;
}

/** Rough city centres, used to place short plus codes when a record has no pin yet. */
export const CITY_CENTRES: Record<string, { lat: number; lng: number }> = {
  hyderabad: { lat: 17.385, lng: 78.4867 },
  visakhapatnam: { lat: 17.6868, lng: 83.2185 },
};
