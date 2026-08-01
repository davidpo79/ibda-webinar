#!/usr/bin/env node
// Measures the active working time of the current Claude Code session and
// pushes it to the shared retainer page at /partner.
//
// Every line of a session transcript carries an ISO timestamp. Summing the
// gaps between consecutive events — while discarding any gap longer than
// IDLE_CAP_MINUTES — yields net time actually spent working, rather than the
// meaningless wall-clock span from the first message to the last. The
// measurement is deliberately conservative: long pauses are dropped
// entirely, so this under-counts rather than over-counts.
//
// Usage:
//   node scripts/sync-hours.mjs --describe "what was worked on"
//   node scripts/sync-hours.mjs --details "longer explanation"
//   node scripts/sync-hours.mjs --dry-run     measure and print, send nothing
//   node scripts/sync-hours.mjs --status      just show the current balance
//
// Environment:
//   RETAINER_SYNC_TOKEN   shared secret, must match the deployed server
//   RETAINER_SYNC_URL     defaults to the production site

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const IDLE_CAP_MINUTES = 15;
const TZ = "Asia/Jerusalem";
const PROJECTS_DIR = "/root/.claude/projects";
const DEFAULT_URL = "https://web-production-8c2b1.up.railway.app";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (process.argv[i + 1] ?? "") : null;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

// The current session is the most recently modified top-level transcript.
// Subagent transcripts live in nested directories and are skipped: their
// time overlaps the parent session and would be double-counted.
function findCurrentTranscript() {
  let newest = null;
  let projectDirs;
  try {
    projectDirs = readdirSync(PROJECTS_DIR);
  } catch {
    return null;
  }
  for (const project of projectDirs) {
    const dir = join(PROJECTS_DIR, project);
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const full = join(dir, file);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (!newest || st.mtimeMs > newest.mtimeMs) {
        newest = { path: full, mtimeMs: st.mtimeMs, sessionId: file.replace(/\.jsonl$/, "") };
      }
    }
  }
  return newest;
}

const TS_RE = /"timestamp":"([0-9T:\-.]+Z)"/;

function collectTimestamps(path) {
  const stamps = [];
  // Parsed line-by-line with a regex rather than JSON.parse: transcripts run
  // to tens of megabytes and only the timestamp is needed.
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = TS_RE.exec(line);
    if (!m) continue;
    const t = Date.parse(m[1]);
    if (Number.isFinite(t)) stamps.push(t);
  }
  stamps.sort((a, b) => a - b);
  return stamps;
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dayOf = (ms) => dayFormatter.format(new Date(ms));

// Each gap is credited to the day it started on, so an evening session that
// runs past midnight splits across both dates instead of landing entirely
// on one.
function measurePerDay(stamps) {
  const cap = IDLE_CAP_MINUTES * 60 * 1000;
  const perDay = new Map();
  for (let i = 1; i < stamps.length; i++) {
    const delta = stamps[i] - stamps[i - 1];
    if (delta <= 0 || delta > cap) continue;
    const key = dayOf(stamps[i - 1]);
    perDay.set(key, (perDay.get(key) ?? 0) + delta);
  }
  return [...perDay.entries()]
    .map(([date, ms]) => ({ date, hours: Math.round((ms / 3600000) * 100) / 100 }))
    .filter((d) => d.hours >= 0.05)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function post(days, sessionId, title, details) {
  const token = process.env.RETAINER_SYNC_TOKEN;
  if (!token) {
    console.error("RETAINER_SYNC_TOKEN is not set — cannot sync.");
    process.exit(1);
  }
  const base = (process.env.RETAINER_SYNC_URL || DEFAULT_URL).replace(/\/$/, "");
  const res = await fetch(`${base}/api/partner/sync-hours`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sessionId, days: days.map((d) => ({ ...d, title, details })) }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`sync failed (${res.status}): ${text}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

async function main() {
  const transcript = findCurrentTranscript();
  if (!transcript) {
    console.error(`No session transcript found under ${PROJECTS_DIR}`);
    process.exit(1);
  }

  const stamps = collectTimestamps(transcript.path);
  const days = measurePerDay(stamps);
  const total = days.reduce((s, d) => s + d.hours, 0);

  console.log(`session   : ${transcript.sessionId}`);
  console.log(`events    : ${stamps.length}`);
  console.log(`idle cap  : ${IDLE_CAP_MINUTES} min (longer pauses not counted)`);
  for (const d of days) console.log(`  ${d.date}  ${d.hours.toFixed(2)} h`);
  console.log(`measured  : ${total.toFixed(2)} h`);

  if (hasFlag("status")) return;
  if (hasFlag("dry-run")) {
    console.log("\n--dry-run: nothing sent.");
    return;
  }
  if (days.length === 0) {
    console.log("\nNothing to sync yet.");
    return;
  }

  const title = arg("describe");
  const details = arg("details");
  const result = await post(days, transcript.sessionId, title, details);

  // The server refuses days on or before the bank's start date — the opening
  // entry already accounts for those. Surfaced so a skipped day never looks
  // like a silent failure.
  if (result.skippedBeforeStart?.length) {
    console.log(
      `\nskipped ${result.skippedBeforeStart.length} day(s) on/before the bank start date: ` +
        result.skippedBeforeStart.join(", "),
    );
  }
  console.log(`applied ${result.applied.length} day(s).`);

  const s = result.summary;
  console.log(
    `bank: ${s.hoursUsed.toFixed(2)} used / ${s.hoursRemaining.toFixed(2)} left ` +
      `of ${s.totalHours} (${s.percentUsed}%)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
