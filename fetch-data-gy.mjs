#!/usr/bin/env node
/**
 * fetch-data-gy.mjs — bygger gy-data.json för gymnasie-kartan.
 *
 * Gymnasiestatistik är PER PROGRAM (programMetrics), inte ett enda värde
 * per skola. Vi sparar därför varje skolas program med nyckeltalen:
 *   - antagningspoäng (admissionPointsAverage / Min)
 *   - examen inom 3 år (ratioOfPupilsWithExamWithin3Years)
 *   - betygspoäng (gradesPointsForStudents / WithExam, 0–20)
 *   - nationella prov (SVE/ENG/MA)
 *
 * Kör:  node fetch-data-gy.mjs   (Node 18+, inga npm-paket)
 * Cache per skola i cache/gy/<kod>.json.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE = 'https://api.skolverket.se/planned-educations';
const ACCEPT = 'application/vnd.skolverket.plannededucations.api.v4.hal+json';
const CACHE_DIR = path.join(process.cwd(), 'cache', 'gy2');
const CACHE_SURVEY = path.join(process.cwd(), 'cache', 'survey-gy');
const OUT = path.join(process.cwd(), 'gy-data.json');
const CONCURRENCY = 6, PAGE_SIZE = 100, RETRIES = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname, { tries = RETRIES } = {}) {
  const url = pathname.startsWith('http') ? pathname : BASE + pathname;
  for (let a = 1; a <= tries; a++) {
    try {
      const res = await fetch(url, { headers: { Accept: ACCEPT } });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      const json = await res.json();
      return json.body ?? json;
    } catch (e) { if (a === tries) throw e; await sleep(500 * a * a); }
  }
}
function num(raw) {
  if (raw == null) return null;
  const s = String(raw).replace('cirka', '').trim().replace(',', '.');
  if (s === '' || s === '.' || s === '..') return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
function latest(arr) {
  if (!Array.isArray(arr) || !arr.length) return { value: null, period: null };
  const ok = arr.filter((x) => x && x.valueType === 'EXISTS' && num(x.value) != null);
  if (!ok.length) return { value: null, period: null };
  ok.sort((a, b) => String(b.timePeriod).localeCompare(String(a.timePeriod)));
  return { value: num(ok[0].value), period: ok[0].timePeriod ?? null };
}
// hela tidsserien { period: value }
function seriesOf(arr) {
  const o = {};
  if (Array.isArray(arr)) for (const x of arr) {
    if (x && x.valueType === 'EXISTS' && x.timePeriod) {
      const v = num(x.value); if (v != null) o[x.timePeriod] = v;
    }
  }
  return o;
}
async function fetchAllPages(pathname, key) {
  const out = []; let page = 0;
  for (;;) {
    const sep = pathname.includes('?') ? '&' : '?';
    const body = await api(`${pathname}${sep}page=${page}&size=${PAGE_SIZE}`);
    const items = body?._embedded?.[key] ?? [];
    out.push(...items);
    process.stdout.write(`\r  ${key}: ${out.length}`);
    const info = body?.page;
    if (!info || page >= info.totalPages - 1 || !items.length) break;
    page++;
  }
  process.stdout.write('\n');
  return out;
}
async function mapPool(items, worker, n) {
  const ret = new Array(items.length); let i = 0, done = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { ret[idx] = await worker(items[idx]); } catch { ret[idx] = null; }
      if (++done % 25 === 0 || done === items.length) process.stdout.write(`\r  statistik: ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: n }, run));
  process.stdout.write('\n');
  return ret;
}

async function getKommunMap() {
  const areas = await api('/v4/support/geographical-areas');
  const m = new Map();
  for (const a of areas || []) if (a.areaType === 'MUNICIPALITY') m.set(a.code, a.name);
  return m;
}
async function getSchools() {
  console.log('Hämtar gymnasieskolor…');
  const list = await fetchAllPages('/v4/school-units?typeOfSchooling=gy', 'listedSchoolUnits');
  const out = [];
  for (const u of list) {
    if (u.abroadSchool) continue;
    if (!(u.typeOfSchooling || []).some((t) => t.code === 'gy')) continue;
    out.push({ code: u.code, name: u.name, kommunCode: u.geographicalAreaCode, ort: u.postCodeDistrict || null, huvudman: u.principalOrganizerType || null });
  }
  return out;
}
async function getCoords() {
  console.log('Hämtar koordinater…');
  const list = await fetchAllPages('/v4/compact-school-units?typeOfSchooling=gy&coordinateSystemType=WGS84', 'compactSchoolUnits');
  const m = new Map();
  for (const c of list) {
    const lat = num(c.wgs84Latitude), lng = num(c.wgs84Longitude);
    if (lat && lng && !(lat === 0 && lng === 0)) m.set(c.schoolUnitCode, { lat, lng });
  }
  return m;
}
async function getStats(code) {
  const cf = path.join(CACHE_DIR, code + '.json');
  if (existsSync(cf)) { try { return JSON.parse(await readFile(cf, 'utf8')); } catch {} }
  const body = await api(`/v4/school-units/${code}/statistics/gy`);
  if (!body) return null;
  const programs = [];
  for (const p of body.programMetrics || []) {
    const a = latest(p.admissionPointsAverage), am = latest(p.admissionPointsMin);
    const g = latest(p.gradesPointsForStudents), ge = latest(p.gradesPointsForStudentsWithExam);
    const e = latest(p.ratioOfPupilsWithExamWithin3Years), h = latest(p.ratioOfStudentsEligibleForUndergraduateEducation);
    const ns = latest(p.averageResultNationalTestsSubjectSVE), ne = latest(p.averageResultNationalTestsSubjectENG);
    const nm = latest(p.averageResultNationalTestsSubjectMA1).value != null
      ? latest(p.averageResultNationalTestsSubjectMA1) : latest(p.averageResultNationalTestsSubjectMA2);
    const elever = latest(p.totalNumberOfPupils).value;
    const row = { c: p.programCode, n: elever, a: a.value, am: am.value, ay: a.period,
      g: g.value, ge: ge.value, e: e.value, h: h.value, ns: ns.value, ne: ne.value, nm: nm.value,
      sa: seriesOf(p.admissionPointsAverage),
      se: seriesOf(p.ratioOfPupilsWithExamWithin3Years),
      sg: seriesOf(p.gradesPointsForStudents) };
    if (row.a == null && row.g == null && row.e == null && row.ns == null) continue; // helt tomt
    programs.push(row);
  }
  const out = {
    elever: latest(body.totalNumberOfPupils).value,
    lararbehorighet: latest(body.certifiedTeachersQuota).value,
    programs,
  };
  await writeFile(cf, JSON.stringify(out));
  return out;
}

// ---------- Skolenkäten (elever år 2) ----------
function svAvg(m) { return m ? num(m.average) : null; }
function pickMetrics(o) {
  if (!o) return null;
  const r = { trygg: svAvg(o.securityMetrics), nojd: svAvg(o.satisfactionMetrics), ro: svAvg(o.workingEnvironmentMetrics),
    stod: svAvg(o.supportMetrics), stim: svAvg(o.inspirationMetrics),
    n: o.noOfAnswers != null ? Math.round(num(o.noOfAnswers)) : null, sem: o.semester || null };
  if ([r.trygg, r.nojd, r.ro, r.stod, r.stim].every((v) => v == null)) return null;
  return r;
}
function pickPupil(body, order) {
  const arr = body && body.schoolYearMetrics; if (!Array.isArray(arr)) return null;
  for (const yr of order) { const s = pickMetrics(arr.find((x) => x.schoolYear === yr)); if (s) { s.ak = yr; return s; } }
  for (const e of arr) { const s = pickMetrics(e); if (s) { s.ak = e.schoolYear; return s; } }
  return null;
}
async function getSurvey(code) {
  const cf = path.join(CACHE_SURVEY, code + '.json');
  if (existsSync(cf)) { try { return JSON.parse(await readFile(cf, 'utf8')); } catch {} }
  let e = null;
  try { e = pickPupil(await api(`/v4/school-units/${code}/nestedsurveys/pupilsgy`), ['ar2']); } catch {}
  const out = e ? { e } : null;
  await writeFile(cf, JSON.stringify(out));
  return out;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(CACHE_SURVEY, { recursive: true });
  const [kommuner, schools, coords] = await Promise.all([getKommunMap(), getSchools(), getCoords()]);
  console.log(`\n${schools.length} gymnasieskolor.`);
  console.log('Hämtar statistik per skola…');
  const stats = await mapPool(schools, (s) => getStats(s.code), CONCURRENCY);

  console.log('Hämtar enkät (Skolenkäten: elever år 2)…');
  const surveys = await mapPool(schools, (s) => getSurvey(s.code), CONCURRENCY);

  const rows = [];
  schools.forEach((s, i) => {
    const st = stats[i];
    if (!st || !st.programs.length) return;
    const c = coords.get(s.code) || {};
    const sv = surveys[i];
    rows.push({
      kod: s.code, namn: s.name,
      kommun: kommuner.get(s.kommunCode) || s.ort || '—', ort: s.ort, huvudman: s.huvudman,
      lat: c.lat ?? null, lng: c.lng ?? null,
      elever: st.elever, lararbehorighet: st.lararbehorighet,
      programs: st.programs,
      ...(sv ? { survey: sv } : {}),
    });
  });
  const years = rows.flatMap((r) => r.programs.map((p) => p.ay)).filter(Boolean).sort();
  const out = {
    generatedAt: new Date().toISOString(),
    source: 'Skolverket – Planned Educations API v4',
    level: 'gymnasium',
    count: rows.length,
    latestPeriod: years[years.length - 1] || null,
    schools: rows,
  };
  await writeFile(OUT, JSON.stringify(out));
  console.log(`\nKlart: ${rows.length} skolor → ${OUT}`);
}
main().catch((e) => { console.error('\nFel:', e); process.exit(1); });
