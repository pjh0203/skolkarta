#!/usr/bin/env node
/**
 * probe-survey.mjs — utforskar Skolenkäten-svarens RIKTIGA struktur.
 *
 * Kör:  node probe-survey.mjs
 *   (läser skolkoder från ./data.json; eller ange koder själv:)
 *       node probe-survey.mjs 12345678 87654321
 *
 * Skolenkäten är vartannat-år per skola, så vissa koder ger tomt — skriptet
 * provar flera tills det hittar skolor MED data, skriver ut strukturen och
 * sparar råsvaret till survey-sample-*.json.
 *
 * Skicka tillbaka det utskrivna "STRUKTUR"-blocket (eller de sparade filerna)
 * så låser vi fältnamnen och bygger in det i fetch-data.mjs.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = 'https://api.skolverket.se/planned-educations';
const ACCEPT = 'application/vnd.skolverket.plannededucations.api.v4.hal+json';

// vilka enkät-endpoints att prova (flat-format är enklast att läsa)
const ENDPOINTS = [
  { key: "nested-pupilsgr", path: "nestedsurveys/pupilsgr", label: "Elever grundskola (学生 nested)" },
  { key: "nested-pupilsgy", path: "nestedsurveys/pupilsgy", label: "Elever gymnasium (高中学生 nested)" },
];
const WANT_PER_ENDPOINT = 1; // hur många skolor-med-data vi vill se per endpoint

async function api(path) {
  const res = await fetch(`${BASE}/v4/school-units/${path}`, { headers: { Accept: ACCEPT } });
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: (await res.json()).body ?? null };
}

function hasData(body) {
  if (!body || typeof body !== 'object') return false;
  return JSON.stringify(body).length > 120; // tomt svar är litet
}

// kort, läsbar struktursammanfattning
function summarize(body, depth = 0, maxDepth = 4) {
  const pad = '  '.repeat(depth);
  if (Array.isArray(body)) {
    let s = `Array(${body.length})`;
    if (body.length && depth < maxDepth) s += ` of:\n${pad}  ` + summarize(body[0], depth + 1, maxDepth);
    return s;
  }
  if (body && typeof body === 'object') {
    const keys = Object.keys(body);
    if (depth >= maxDepth) return `{ ${keys.join(', ')} }`;
    return '{\n' + keys.map(k => `${pad}  ${k}: ${summarize(body[k], depth + 1, maxDepth)}`).join('\n') + `\n${pad}}`;
  }
  if (typeof body === 'string') return `"${body.length > 40 ? body.slice(0, 40) + '…' : body}"`;
  return String(body);
}

// hitta första array av "datapunkter" och visa distinkta fält
function inspectDataPoints(body) {
  let arr = null;
  const walk = (o) => {
    if (arr) return;
    if (Array.isArray(o) && o.length && typeof o[0] === 'object') { arr = o; return; }
    if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(body);
  if (!arr) return '  (hittade ingen datapunkt-array)';
  const fields = Object.keys(arr[0]);
  const distinct = (f) => [...new Set(arr.map(x => x[f]).filter(v => v != null))];
  let out = `  datapunkter: ${arr.length}, fält: [${fields.join(', ')}]\n`;
  for (const f of fields) {
    const d = distinct(f);
    if (d.length <= 12) out += `   · ${f}: ${JSON.stringify(d)}\n`;
    else out += `   · ${f}: ${d.length} distinkta, ex ${JSON.stringify(d.slice(0, 4))}\n`;
  }
  out += `  exempel: ${JSON.stringify(arr[0])}`;
  return out;
}

async function main() {
  let codes = process.argv.slice(2);
  if (!codes.length) {
    if (!existsSync('./data.json')) { console.error('Ingen data.json och inga koder angivna.'); process.exit(1); }
    const set=[];
    for (const f of ["./data.json","./gy-data.json"]) {
      if (existsSync(f)) { try { const d=JSON.parse(await readFile(f,"utf8")); set.push(...d.schools.map(s=>s.kod).slice(0,60)); } catch {} }
    }
    codes = [...new Set(set)];
  }
  console.log(`Provar ${codes.length} skolkoder…\n`);

  for (const ep of ENDPOINTS) {
    let found = 0;
    console.log('═'.repeat(64));
    console.log(`ENDPOINT: ${ep.path}   (${ep.label})`);
    console.log('═'.repeat(64));
    for (const code of codes) {
      if (found >= WANT_PER_ENDPOINT) break;
      let r;
      try { r = await api(`${code}/${ep.path}`); } catch (e) { continue; }
      if (r.status !== 200 || !hasData(r.body)) continue;
      found++;
      console.log(`\n✔ skola ${code} har data.\n`);
      console.log('STRUKTUR:');
      console.log(summarize(r.body));
      console.log('\nDATAPUNKTER:');
      console.log(inspectDataPoints(r.body));
      const file = `survey-sample-${ep.key}.json`;
      await writeFile(file, JSON.stringify(r.body, null, 2));
      console.log(`\n(råsvar sparat: ${file})\n`);
    }
    if (!found) console.log('  — ingen av de provade skolorna hade data för denna endpoint (prova fler koder).');
  }
  console.log('\nKlart. Skicka tillbaka STRUKTUR-blocken (eller survey-sample-*.json) så bygger vi in det.');
}
main().catch(e => { console.error('Fel:', e); process.exit(1); });
