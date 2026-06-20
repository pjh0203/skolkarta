#!/usr/bin/env node
/**
 * fetch-data.mjs — bygger data.json för "9:ans betygskarta"
 *
 * Hämtar alla grundskolor (gr) med årskurs 9 från Skolverkets
 * Planned Educations API (v4) och skriver en kompakt data.json som
 * webbsidan (index.html) läser in.
 *
 * Tre nyckeltal per skola (senaste tillgängliga läsår):
 *   - meritvarde   : averageGradesMeritRating9thGrade            (0–340)
 *   - behorighet   : ratioOfPupils9thGradeEligibleForNationalProgramYR (%)
 *   - np           : medel av nationella prov SVE/ENG/MA i åk 9  (0–20)
 *
 * Kör:  node fetch-data.mjs
 * Kräver Node 18+ (global fetch). Inga npm-paket.
 *
 * Snäll mot API:et: begränsad parallellism + cache på disk
 * (cache/stats/<kod>.json) så att omkörningar går snabbt.
 */

import { writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE = 'https://api.skolverket.se/planned-educations';
const ACCEPT = 'application/vnd.skolverket.plannededucations.api.v4.hal+json';
const CACHE_DIR = path.join(process.cwd(), 'cache', 'gr2');
const OUT = path.join(process.cwd(), 'data.json');

const CONCURRENCY = 6;        // samtidiga statistik-anrop
const PAGE_SIZE = 100;        // max enligt API:et
const RETRIES = 4;

// ---------- low level ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname, { tries = RETRIES } = {}) {
  const url = pathname.startsWith('http') ? pathname : BASE + pathname;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: ACCEPT } });
      if (res.status === 404) return null;            // saknas → hoppa över
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      const json = await res.json();
      return json.body ?? json;                        // skala bort ApiResponse-höljet
    } catch (err) {
      if (attempt === tries) throw err;
      await sleep(500 * attempt * attempt);            // backoff
    }
  }
}

// "288,5" -> 288.5 ; "." / ".." / null -> null ; "cirka 1110" -> 1110
function num(raw) {
  if (raw == null) return null;
  const s = String(raw).replace('cirka', '').trim().replace(',', '.');
  if (s === '' || s === '.' || s === '..') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Plocka senaste EXISTS-värdet ur en metric-array [{value,valueType,timePeriod}]
function latest(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return { value: null, period: null };
  const ok = arr.filter((x) => x && x.valueType === 'EXISTS' && num(x.value) != null);
  if (ok.length === 0) return { value: null, period: null };
  ok.sort((a, b) => String(b.timePeriod).localeCompare(String(a.timePeriod)));
  return { value: num(ok[0].value), period: ok[0].timePeriod ?? null };
}

// Hela tidsserien som { "2024/25": 231.0, ... }
function seriesOf(arr) {
  const o = {};
  if (Array.isArray(arr)) for (const x of arr) {
    if (x && x.valueType === 'EXISTS' && x.timePeriod) {
      const v = num(x.value);
      if (v != null) o[x.timePeriod] = v;
    }
  }
  return o;
}
// NP-serie = medel av SVE/ENG/MA per läsår
function npSeries(body) {
  const subs = [
    seriesOf(body.averageResultNationalTestsSubjectSVE9thGrade),
    seriesOf(body.averageResultNationalTestsSubjectENG9thGrade),
    seriesOf(body.averageResultNationalTestsSubjectMA9thGrade),
  ];
  const periods = new Set();
  subs.forEach((s) => Object.keys(s).forEach((p) => periods.add(p)));
  const o = {};
  for (const p of periods) {
    const vals = subs.map((s) => s[p]).filter((v) => v != null);
    if (vals.length) o[p] = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }
  return o;
}

// ---------- pagination ----------

async function fetchAllPages(pathname, embeddedKey) {
  const out = [];
  let page = 0;
  for (;;) {
    const sep = pathname.includes('?') ? '&' : '?';
    const body = await api(`${pathname}${sep}page=${page}&size=${PAGE_SIZE}`);
    const items = body?._embedded?.[embeddedKey] ?? [];
    out.push(...items);
    const info = body?.page;
    process.stdout.write(`\r  ${embeddedKey}: ${out.length} st`);
    if (!info || page >= info.totalPages - 1 || items.length === 0) break;
    page++;
  }
  process.stdout.write('\n');
  return out;
}

// ---------- steps ----------

async function getKommunMap() {
  const areas = await api('/v4/support/geographical-areas');
  const map = new Map();
  for (const a of areas || []) {
    if (a.areaType === 'MUNICIPALITY') map.set(a.code, a.name);
  }
  return map;
}

// Skolenheter med grundskola; behåll bara de som faktiskt har åk 9
async function getSchools() {
  console.log('Hämtar skolenheter (gr)…');
  const list = await fetchAllPages('/v4/school-units?typeOfSchooling=gr', 'listedSchoolUnits');
  const schools = [];
  for (const u of list) {
    if (u.abroadSchool) continue;
    const gr = (u.typeOfSchooling || []).find((t) => t.code === 'gr');
    if (!gr) continue;
    if (!(gr.schoolYears || []).map(String).includes('9')) continue; // måste ha åk 9
    schools.push({
      code: u.code,
      name: u.name,
      kommunCode: u.geographicalAreaCode,
      ort: u.postCodeDistrict || null,
      huvudman: u.principalOrganizerType || null,
    });
  }
  return schools;
}

// Koordinater (WGS84) per skolenhetskod
async function getCoords() {
  console.log('Hämtar koordinater (compact)…');
  const list = await fetchAllPages(
    '/v4/compact-school-units?typeOfSchooling=gr&coordinateSystemType=WGS84',
    'compactSchoolUnits'
  );
  const map = new Map();
  for (const c of list) {
    const lat = num(c.wgs84Latitude);
    const lng = num(c.wgs84Longitude);
    if (lat && lng && !(lat === 0 && lng === 0)) map.set(c.schoolUnitCode, { lat, lng });
  }
  return map;
}

// SALSA för alla grundskolor i ETT anrop. Ger avvikelse (värde-added):
// faktiskt resultat minus modellens förväntade, givet elevernas bakgrund.
async function getSalsa() {
  console.log('Hämtar SALSA (alla skolor, ett anrop)…');
  const body = await api('/v4/statistics/all-schools/salsa');
  const list = body?.compulsorySchoolUnitSalsaMetricList || [];
  const map = new Map();
  for (const s of list) {
    map.set(s.schoolUnitCode, {
      salsaDev: num(s.salsaAverageGradesIn9thGradeDeviation?.value),     // merit-avvikelse (kärnan)
      salsaActual: num(s.salsaAverageGradesIn9thGradeActual?.value),     // faktiskt meritvärde
      salsaCalc: num(s.salsaAverageCalculated?.value),                   // modellens förväntade
      salsaReqDev: num(s.salsaRequirementsReachedDeviation?.value),      // behörighet-avvikelse
      salsaParents: num(s.salsaParentsEducation?.value),                 // bakgrundsindex
    });
  }
  console.log(`  SALSA: ${map.size} skolor (läsår ${body?.timePeriod || '?'})`);
  return { map, period: body?.timePeriod || null };
}

async function getStats(code) {
  const cacheFile = path.join(CACHE_DIR, code + '.json');
  if (existsSync(cacheFile)) {
    try { return JSON.parse(await readFile(cacheFile, 'utf8')); } catch {}
  }
  const body = await api(`/v4/school-units/${code}/statistics/gr`);
  if (!body) return null;

  const merit = latest(body.averageGradesMeritRating9thGrade);
  const beh = latest(body.ratioOfPupils9thGradeEligibleForNationalProgramYR);
  const passed = latest(body.ratioOfPupilsIn9thGradeWithAllSubjectsPassed);
  const npSve = latest(body.averageResultNationalTestsSubjectSVE9thGrade);
  const npEng = latest(body.averageResultNationalTestsSubjectENG9thGrade);
  const npMa = latest(body.averageResultNationalTestsSubjectMA9thGrade);
  const npParts = [npSve.value, npEng.value, npMa.value].filter((x) => x != null);
  const np = npParts.length ? +(npParts.reduce((a, b) => a + b, 0) / npParts.length).toFixed(1) : null;
  const teachers = latest(body.certifiedTeachersQuota);
  const pupils = latest(body.totalNumberOfPupils);

  const out = {
    meritvarde: merit.value,
    behorighet: beh.value,
    np,
    npSve: npSve.value, npEng: npEng.value, npMa: npMa.value,
    andelGodkand: passed.value,
    lararbehorighet: teachers.value,
    elever: pupils.value,
    period: merit.period || beh.period || np && npSve.period || null,
    series: {
      meritvarde: seriesOf(body.averageGradesMeritRating9thGrade),
      behorighet: seriesOf(body.ratioOfPupils9thGradeEligibleForNationalProgramYR),
      np: npSeries(body),
    },
  };
  await writeFile(cacheFile, JSON.stringify(out));
  return out;
}

// enkel pool
async function mapPool(items, worker, n) {
  const ret = new Array(items.length);
  let i = 0, done = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { ret[idx] = await worker(items[idx], idx); }
      catch { ret[idx] = null; }
      done++;
      if (done % 25 === 0 || done === items.length) {
        process.stdout.write(`\r  statistik: ${done}/${items.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: n }, run));
  process.stdout.write('\n');
  return ret;
}

// ---------- main ----------

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  const [kommuner, schools, coords, salsa] = await Promise.all([
    getKommunMap(),
    getSchools(),
    getCoords(),
    getSalsa(),
  ]);
  console.log(`\n${schools.length} grundskolor med åk 9.`);

  console.log('Hämtar statistik per skola (cache används om möjlig)…');
  const stats = await mapPool(schools, (s) => getStats(s.code), CONCURRENCY);

  const rows = [];
  schools.forEach((s, idx) => {
    const st = stats[idx];
    const sa = salsa.map.get(s.code) || {};
    if (!st && sa.salsaDev == null) return;
    const merged = { ...(st || {}), ...sa };
    if (merged.meritvarde == null && merged.behorighet == null && merged.np == null && merged.salsaDev == null) return;
    const c = coords.get(s.code) || {};
    rows.push({
      kod: s.code,
      namn: s.name,
      kommun: kommuner.get(s.kommunCode) || s.ort || '—',
      ort: s.ort,
      huvudman: s.huvudman,
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      ...merged,
    });
  });

  const periods = rows.map((r) => r.period).filter(Boolean).sort();
  const out = {
    generatedAt: new Date().toISOString(),
    source: 'Skolverket – Planned Educations API v4',
    count: rows.length,
    latestPeriod: periods[periods.length - 1] || null,
    salsaPeriod: salsa.period,
    schools: rows,
  };
  await writeFile(OUT, JSON.stringify(out));
  console.log(`\nKlart: ${rows.length} skolor → ${OUT}`);
  console.log(`Senaste läsår i datat: ${out.latestPeriod}`);
}

main().catch((e) => { console.error('\nFel:', e); process.exit(1); });
