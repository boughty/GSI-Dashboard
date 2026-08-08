import React, { useMemo, useState } from "react";

/* ============================================================================
   MOCK DATA ADAPTER LAYER
   ----------------------------------------------------------------------------
   Everything in this block is shaped to mirror what real API calls would
   return. When ready to connect real systems, replace the three functions
   marked "REPLACE WITH REAL API CALL" — nothing below this block needs to
   change, since the rest of the app only consumes the unified `Learner[]`
   shape produced by buildDataset().

   Real-world mapping:
   - fetchRoster()            -> your own HR/practice-ops roster system
   - fetchSkilljarProgress()  -> Skilljar "get course progress for users" API
   - fetchCredlyBadges()      -> Credly "high_volume_issued_badge_search" API
   Join key across all three: person email / issuer_earner_id.
   ============================================================================ */

const GEOS = ["North America", "LATAM", "Europe", "Middle East & Africa", "SEA", "ANZ", "Korea", "Japan"];
const VERTICALS = ["Automotive", "Pharmaceuticals", "Health Care", "Financial Services", "Government", "Retail"];

// function -> [cert path label, headcount weight]
const FUNCTIONS = [
  { key: "Sales", cert: "Practice Core", weight: 0.14 },
  { key: "Customer Success", cert: "Practice Core", weight: 0.12 },
  { key: "Program Management", cert: "Practice Core", weight: 0.08 },
  { key: "Developer", cert: "Developer Foundations", weight: 0.42 },
  { key: "Architect (Foundations)", cert: "Architect Foundations", weight: 0.16 },
  { key: "Architect (Pro)", cert: "Architect Pro", weight: 0.08 },
];

// 6 waves, launching every other month starting month 2. "Today" = day 220 (~month 7.3)
const TODAY = 220;
const WAVES = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: n,
  label: `Wave ${n}`,
  startDay: (n - 1) * 60 + 30, // month 2,4,6,8,10,12 in ~30-day months
}));
const EXPECTED_DAYS_TO_COMPLETE = 45; // target pace, in days-into-wave

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const FIRST_NAMES = ["Aiko","Ben","Carla","Deshawn","Elin","Farid","Grace","Hana","Ivan","Jaya","Kofi","Lena","Marco","Nadia","Omar","Priya","Quinn","Rosa","Sami","Tara","Uma","Viktor","Wren","Yara","Zane","Alex","Bea","Cyrus","Dana","Emil"];
const LAST_NAMES = ["Okafor","Silva","Nguyen","Petrov","Kim","Rossi","Haddad","Meyer","Singh","Duarte","Watanabe","Costa","Adeyemi","Lindqvist","Park","Fischer","Torres","Novak","Reyes","Baptiste"];

function buildGroupModifiers(rand, keys) {
  const mods = {};
  keys.forEach((k) => { mods[k] = 0.82 + rand() * 0.36; }); // persistent group-level pace variance, ~0.82x-1.18x
  return mods;
}

function buildRoster(count, seed) {
  const rand = seededRandom(seed);
  const geoMods = buildGroupModifiers(rand, GEOS);
  const verticalMods = buildGroupModifiers(rand, VERTICALS);
  const functionMods = buildGroupModifiers(rand, FUNCTIONS.map((f) => f.key));

  const people = [];
  const cumWeights = [];
  let acc = 0;
  FUNCTIONS.forEach((f) => { acc += f.weight; cumWeights.push(acc); });

  for (let i = 0; i < count; i++) {
    const r = rand();
    const fIdx = cumWeights.findIndex((w) => r <= w);
    const fn = FUNCTIONS[fIdx];
    const wave = WAVES[Math.floor(rand() * WAVES.length)];
    const geo = GEOS[Math.floor(rand() * GEOS.length)];
    const vertical = VERTICALS[Math.floor(rand() * VERTICALS.length)];
    const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
    const coe = rand() < 0.03; // ~3% flagged into the leadership/CoE cohort

    // individual variance layered on top of persistent group-level pace
    const individualNoise = 0.75 + rand() * 0.7;
    const pace = individualNoise * geoMods[geo] * verticalMods[vertical] * functionMods[fn.key];

    people.push({
      id: `p_${i}`,
      name: `${first} ${last}`,
      email: `${first}.${last}.${i}@example.com`.toLowerCase(),
      function: fn.key,
      cert: fn.cert,
      geo,
      vertical,
      wave: wave.id,
      waveStartDay: wave.startDay,
      coe,
      pace,
    });
  }
  return people;
}

// REPLACE WITH REAL API CALL: Skilljar "course progress" endpoint, keyed by user id/email
function fetchSkilljarProgress(roster) {
  return roster.map((p) => {
    const daysElapsed = Math.max(0, TODAY - p.waveStartDay);
    const raw = (daysElapsed / EXPECTED_DAYS_TO_COMPLETE) * p.pace * 100;
    const progress = Math.max(0, Math.min(100, Math.round(raw)));
    return { id: p.id, courseProgressPct: progress };
  });
}

// REPLACE WITH REAL API CALL: Credly "high_volume_issued_badge_search" endpoint
function fetchCredlyBadges(roster, progressById) {
  return roster.map((p) => {
    const pct = progressById[p.id];
    const issued = pct >= 100;
    // approximate the day within the wave they crossed 100%, for time-to-completion
    const completionDay = issued ? Math.round(EXPECTED_DAYS_TO_COMPLETE / p.pace) : null;
    return { id: p.id, badgeIssued: issued, badgeName: p.cert, completionDay };
  });
}

function buildDataset(count = 2600, seed = 42) {
  const roster = buildRoster(count, seed);
  const progress = fetchSkilljarProgress(roster);
  const progressById = Object.fromEntries(progress.map((p) => [p.id, p.courseProgressPct]));
  const badges = fetchCredlyBadges(roster, progressById);
  const badgeById = Object.fromEntries(badges.map((b) => [b.id, b]));

  return roster.map((p) => ({
    ...p,
    progressPct: progressById[p.id],
    badgeIssued: badgeById[p.id].badgeIssued,
    completionDay: badgeById[p.id].completionDay,
  }));
}

/* ============================================================================
   AGGREGATION HELPERS
   ============================================================================ */

function groupStats(people, keyFn) {
  const groups = {};
  people.forEach((p) => {
    const k = keyFn(p);
    if (!groups[k]) groups[k] = [];
    groups[k].push(p);
  });
  return Object.entries(groups)
    .map(([label, members]) => {
      const avgPct = members.reduce((s, m) => s + m.progressPct, 0) / members.length;
      const finished = members.filter((m) => m.badgeIssued);
      const finishedDays = finished.map((m) => m.completionDay).filter(Boolean);
      const fastestFinish = finishedDays.length ? Math.min(...finishedDays) : null;
      const avgFinishDay = finishedDays.length ? Math.round(finishedDays.reduce((s, d) => s + d, 0) / finishedDays.length) : null;
      return {
        label,
        count: members.length,
        avgPct: Math.round(avgPct),
        finishedCount: finished.length,
        finishedPct: Math.round((finished.length / members.length) * 100),
        fastestFinish,
        avgFinishDay,
      };
    })
    .sort((a, b) => {
      if (b.finishedPct !== a.finishedPct) return b.finishedPct - a.finishedPct;
      if (b.avgPct !== a.avgPct) return b.avgPct - a.avgPct;
      const aFin = a.avgFinishDay ?? Infinity;
      const bFin = b.avgFinishDay ?? Infinity;
      return aFin - bFin;
    });
}

function statusFor(avgPct, waveStartDay) {
  const daysElapsed = Math.max(1, TODAY - waveStartDay);
  const expectedPct = Math.min(100, (daysElapsed / EXPECTED_DAYS_TO_COMPLETE) * 100);
  const delta = avgPct - expectedPct;
  if (delta >= -10) return { label: "On track", tone: "good" };
  if (delta >= -25) return { label: "At risk", tone: "warn" };
  return { label: "Behind", tone: "bad" };
}

// Use when a group spans multiple waves at different stages: computes each person's own
// expected pace against their own wave's elapsed time first, then averages the gap.
// Averaging progress and averaging wave-start-day separately (then comparing) understates
// pace for groups mixing not-yet-launched people with long-finished ones.
function statusForMembers(members) {
  if (!members.length) return { label: "No data", tone: "warn" };
  const deltas = members.map((m) => {
    const elapsed = TODAY - m.waveStartDay;
    if (elapsed <= 0) return 0; // wave hasn't launched yet — nothing to be behind on
    const expectedPct = Math.min(100, (elapsed / EXPECTED_DAYS_TO_COMPLETE) * 100);
    return m.progressPct - expectedPct;
  });
  const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  if (avgDelta >= -10) return { label: "On track", tone: "good" };
  if (avgDelta >= -25) return { label: "At risk", tone: "warn" };
  return { label: "Behind", tone: "bad" };
}

/* ============================================================================
   UI PRIMITIVES
   ============================================================================ */

const TONE_COLORS = {
  good: "var(--progress)",
  warn: "var(--amber)",
  bad: "var(--danger)",
};

function StatusPill({ tone, label }) {
  return (
    <span className="pill" style={{ color: TONE_COLORS[tone], borderColor: TONE_COLORS[tone] }}>
      <span className="pill-dot" style={{ background: TONE_COLORS[tone] }} />
      {label}
    </span>
  );
}

function BoardRow({ rank, label, count, finishedCount, finishedPct, avgPct, speedMode, avgFinishDay, finisherSampleSize, paceStatus }) {
  const outstanding = count - finishedCount;
  const showCertifiedRate = speedMode === "resolved";
  const completionLabel = showCertifiedRate ? "Completion (certified)" : "Avg. progress";
  const completionValue = showCertifiedRate ? finishedPct : avgPct;
  return (
    <div className="row">
      <div className="row-rank">{rank}</div>
      <div className="row-label">
        <span className="row-label-main">{label}</span>
        <span className="row-label-sub">{count} total practitioners</span>
      </div>

      <div className="row-stat">
        <div className="row-stat-label">{completionLabel}</div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${completionValue}%` }} /></div>
        <div className="row-stat-num row-stat-num-lg">{completionValue}%</div>
      </div>

      <div className="row-stat">
        <div className="row-stat-label">Certified / outstanding</div>
        <div className="row-stat-num">{finishedCount} <span className="row-stat-dim">/ {outstanding}</span></div>
      </div>

      <div className="row-stat">
        <div className="row-stat-label">Speed</div>
        {speedMode === "resolved" && avgFinishDay != null && (
          <div className="row-stat-num">{avgFinishDay}d</div>
        )}
        {speedMode === "current" && (
          <>
            <StatusPill tone={paceStatus.tone} label={paceStatus.label} />
            {avgFinishDay != null && (
              <div className="row-stat-soft">{avgFinishDay}d so far</div>
            )}
          </>
        )}
        {speedMode === "upcoming" && <div className="row-stat-dim">Not yet launched</div>}
        {speedMode === "none" && <div className="row-stat-dim">Pick a wave</div>}
      </div>
    </div>
  );
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="segctl">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={"segctl-btn" + (value === opt.value ? " active" : "")}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="select-wrap">
      <span className="select-label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

/* ============================================================================
   GAMIFIED BOARDS VIEW
   ============================================================================ */

const DIMENSIONS = {
  Geo: { accessor: (p) => p.geo, options: GEOS },
  Function: { accessor: (p) => p.function, options: FUNCTIONS.map((f) => f.key) },
  Vertical: { accessor: (p) => p.vertical, options: VERTICALS },
};
const MIN_FIELD = 12; // small-field rollup threshold: below this, don't present it as a standalone race

const MEDALS = ["1st", "2nd", "3rd"];

function PodiumCard({ title, top3 }) {
  return (
    <div className="podium-card">
      <div className="podium-title">{title}</div>
      {top3.length === 0 && <div className="podium-empty">No finished waves yet</div>}
      {top3.map((g, i) => (
        <div className={`podium-entry podium-rank-${i + 1}`} key={g.label}>
          <span className="podium-medal">{MEDALS[i]}</span>
          <span className="podium-name">{g.label}</span>
          <span className="podium-value">{g.avgFinishDay}d</span>
        </div>
      ))}
    </div>
  );
}

function GamifiedBoards({ data }) {
  const activeWave = useMemo(() => {
    const started = WAVES.filter((w) => w.startDay <= TODAY);
    const inProgress = started.filter((w) => TODAY - w.startDay <= EXPECTED_DAYS_TO_COMPLETE * 1.5);
    const pick = inProgress.length ? inProgress[inProgress.length - 1] : started[started.length - 1];
    return pick ? String(pick.id) : "all";
  }, []);

  const [wave, setWave] = useState(activeWave);
  const [racingDim, setRacingDim] = useState("Geo");
  const [withinDim, setWithinDim] = useState("none");
  const [withinVal, setWithinVal] = useState("");

  const otherDims = ["Geo", "Function", "Vertical"].filter((d) => d !== racingDim);

  const waveOnlyScoped = useMemo(() => {
    return wave === "all" ? data : data.filter((p) => p.wave === Number(wave));
  }, [data, wave]);

  const scoped = useMemo(() => {
    let rows = waveOnlyScoped;
    if (withinDim !== "none" && withinVal) {
      const accessor = DIMENSIONS[withinDim].accessor;
      rows = rows.filter((p) => accessor(p) === withinVal);
    }
    return rows;
  }, [waveOnlyScoped, withinDim, withinVal]);

  const board = useMemo(() => {
    const accessor = DIMENSIONS[racingDim].accessor;
    return groupStats(scoped, accessor).filter((g) => g.count >= MIN_FIELD);
  }, [scoped, racingDim]);

  // podiums are wave-independent: each group's best-ever avg-days-to-badge, taken only from
  // waves that have actually finished, so a still-running wave can never distort the record
  const podiums = useMemo(() => {
    const finishedWaves = WAVES.filter((w) => TODAY - w.startDay > EXPECTED_DAYS_TO_COMPLETE);
    return ["Geo", "Function", "Vertical"].map((dim) => {
      const accessor = DIMENSIONS[dim].accessor;
      const bestByLabel = {};
      finishedWaves.forEach((w) => {
        const waveData = data.filter((p) => p.wave === w.id);
        groupStats(waveData, accessor)
          .filter((g) => g.count >= MIN_FIELD && g.avgFinishDay != null)
          .forEach((g) => {
            if (!bestByLabel[g.label] || g.avgFinishDay < bestByLabel[g.label]) {
              bestByLabel[g.label] = g.avgFinishDay;
            }
          });
      });
      const top3 = Object.entries(bestByLabel)
        .map(([label, avgFinishDay]) => ({ label, avgFinishDay }))
        .sort((a, b) => a.avgFinishDay - b.avgFinishDay)
        .slice(0, 3);
      return { dim, top3 };
    });
  }, [data]);

  // wave status: how to talk about "speed" for whichever wave(s) are in view
  const waveStatus = useMemo(() => {
    if (wave === "all") return { kind: "none", waveStartDay: null, caption: "All waves combined." };
    const w = WAVES.find((x) => x.id === Number(wave));
    const elapsed = TODAY - w.startDay;
    if (elapsed < 0) return { kind: "upcoming", waveStartDay: w.startDay, caption: `Wave ${wave} launches in ${-elapsed} days.` };
    if (elapsed <= EXPECTED_DAYS_TO_COMPLETE) {
      return { kind: "current", waveStartDay: w.startDay, caption: `Wave ${wave} — day ${elapsed} of ${EXPECTED_DAYS_TO_COMPLETE} target, in progress.` };
    }
    return { kind: "resolved", waveStartDay: w.startDay, caption: `Wave ${wave} — completed (day ${elapsed} today, target was ${EXPECTED_DAYS_TO_COMPLETE}).` };
  }, [wave]);

  const onRacingChange = (dim) => {
    setRacingDim(dim);
    setWithinDim("none");
    setWithinVal("");
  };
  const onWithinDimChange = (dim) => {
    setWithinDim(dim);
    setWithinVal(dim === "none" ? "" : DIMENSIONS[dim].options[0]);
  };

  const MIN_FINISHERS_FOR_AVG = 5; // don't show a speed average from a tiny, likely-biased sample

  return (
    <div className="panel">
      <div className="controls-row">
        <div className="select-wrap">
          <span className="select-label">Racing</span>
          <SegmentedControl
            value={racingDim}
            onChange={onRacingChange}
            options={["Geo", "Function", "Vertical"].map((d) => ({ value: d, label: `${d} Sprint` }))}
          />
        </div>
        <Select
          label="Within (optional)"
          value={withinDim}
          onChange={onWithinDimChange}
          options={["none", ...otherDims]}
        />
        {withinDim !== "none" && (
          <Select label={withinDim} value={withinVal} onChange={setWithinVal} options={DIMENSIONS[withinDim].options} />
        )}
      </div>

      <div className="controls-row">
        <div className="select-wrap">
          <span className="select-label">Wave</span>
          <SegmentedControl
            value={wave}
            onChange={setWave}
            options={[{ value: "all", label: "All" }, ...WAVES.map((w) => ({ value: String(w.id), label: String(w.id) }))]}
          />
        </div>
      </div>

      <div className="podium-row">
        <PodiumCard title="Geo Sprint all-time best" top3={podiums.find((p) => p.dim === "Geo").top3} />
        <PodiumCard title="Function Sprint all-time best" top3={podiums.find((p) => p.dim === "Function").top3} />
        <PodiumCard title="Vertical Sprint all-time best" top3={podiums.find((p) => p.dim === "Vertical").top3} />
      </div>

      <div className="row-head">
        <span></span>
        <span>{racingDim}</span>
        <span>{waveStatus.kind === "resolved" ? "Completion (certified)" : "Avg. progress"}</span>
        <span>Certified / outstanding</span>
        <span>Speed</span>
      </div>

      <div className="rows">
        {board.length === 0 && <div className="empty">Not enough people in this slice yet to race — try a broader filter.</div>}
        {board.map((g, i) => {
          const showAvg = g.finishedCount >= MIN_FINISHERS_FOR_AVG;
          const paceStatus = waveStatus.kind === "current" ? statusFor(g.avgPct, waveStatus.waveStartDay) : null;
          return (
            <BoardRow
              key={g.label}
              rank={i + 1}
              label={g.label}
              count={g.count}
              finishedCount={g.finishedCount}
              finishedPct={g.finishedPct}
              avgPct={g.avgPct}
              speedMode={waveStatus.kind}
              avgFinishDay={showAvg ? g.avgFinishDay : null}
              finisherSampleSize={g.finishedCount}
              paceStatus={paceStatus}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   EXEC DASHBOARD VIEW
   ============================================================================ */

function ExecDashboard({ data }) {
  const [scopeDim, setScopeDim] = useState("Function");
  const [scopeVal, setScopeVal] = useState(FUNCTIONS[0].key);
  const [breakdown, setBreakdown] = useState("Geography");
  const [wave, setWave] = useState("all");

  const scopeOptions = { Function: FUNCTIONS.map((f) => f.key), Geography: GEOS, Vertical: VERTICALS };
  const scopeKeyFn = { Function: (p) => p.function, Geography: (p) => p.geo, Vertical: (p) => p.vertical }[scopeDim];
  const breakdownKeyFn = { Function: (p) => p.function, Geography: (p) => p.geo, Vertical: (p) => p.vertical }[breakdown];

  const scoped = useMemo(() => {
    let rows = data.filter((p) => scopeKeyFn(p) === scopeVal);
    if (wave !== "all") rows = rows.filter((p) => p.wave === Number(wave));
    return rows;
  }, [data, scopeKeyFn, scopeVal, wave]);

  const headline = useMemo(() => {
    const avg = scoped.reduce((s, p) => s + p.progressPct, 0) / (scoped.length || 1);
    const finished = scoped.filter((p) => p.badgeIssued).length;
    return { avg: Math.round(avg), finished, total: scoped.length };
  }, [scoped]);

  const rows = useMemo(() => {
    const stats = groupStats(scoped, breakdownKeyFn);
    return stats.map((s) => {
      const members = scoped.filter((p) => breakdownKeyFn(p) === s.label);
      // a single wave means everyone shares the same start day, so the simple
      // per-wave status function is valid; "all" spans mixed wave stages and
      // needs the per-person version to avoid the averaging bug we hit earlier
      const status = wave === "all"
        ? statusForMembers(members)
        : statusFor(s.avgPct, WAVES.find((w) => w.id === Number(wave)).startDay);
      return { ...s, status };
    });
  }, [scoped, breakdownKeyFn, wave]);

  const onDimChange = (dim) => {
    setScopeDim(dim);
    setScopeVal(scopeOptions[dim][0]);
    if (breakdown === dim) setBreakdown(["Function", "Geography", "Vertical"].find((d) => d !== dim));
  };

  return (
    <div className="panel">
      <div className="controls-row">
        <div className="select-wrap">
          <span className="select-label">View by</span>
          <SegmentedControl
            value={scopeDim}
            onChange={onDimChange}
            options={["Function", "Geography", "Vertical"].map((d) => ({ value: d, label: d }))}
          />
        </div>
        <Select label={scopeDim} value={scopeVal} onChange={setScopeVal} options={scopeOptions[scopeDim]} />
        <Select
          label="Break down by"
          value={breakdown}
          onChange={setBreakdown}
          options={["Function", "Geography", "Vertical"].filter((d) => d !== scopeDim)}
        />
      </div>

      <div className="controls-row">
        <div className="select-wrap">
          <span className="select-label">Wave</span>
          <SegmentedControl
            value={wave}
            onChange={setWave}
            options={[{ value: "all", label: "All" }, ...WAVES.map((w) => ({ value: String(w.id), label: String(w.id) }))]}
          />
        </div>
      </div>

      <div className="headline-card">
        <div className="headline-num">{headline.avg}%</div>
        <div className="headline-meta">
          <div className="headline-title">{scopeVal} — overall progress</div>
          <div className="headline-sub">{headline.finished} of {headline.total} certified{wave === "all" ? " across all waves" : ` in Wave ${wave}`}</div>
        </div>
      </div>

      <div className="exec-table">
        <div className="exec-table-head">
          <span>{breakdown}</span>
          <span>People</span>
          <span>Avg. progress</span>
          <span>Certified</span>
          <span>Status</span>
        </div>
        {rows.map((r) => (
          <div className="exec-row" key={r.label}>
            <span className="exec-row-label">{r.label}</span>
            <span>{r.count}</span>
            <span>
              <div className="mini-bar"><div className="mini-bar-fill" style={{ width: `${r.avgPct}%` }} /></div>
              {r.avgPct}%
            </span>
            <span>{r.finishedCount} ({r.finishedPct}%)</span>
            <span><StatusPill tone={r.status.tone} label={r.status.label} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   APP SHELL
   ============================================================================ */

export default function App() {
  const data = useMemo(() => buildDataset(10000, 42), []);
  const [tab, setTab] = useState("gamified");

  return (
    <div className="app">
      <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Lora:wght@400;500;600&display=swap');
        :root {
          --bg: #0f1420;
          --surface: #171e2e;
          --surface-alt: #1c2438;
          --border: #2a3348;
          --text: #edeff5;
          --muted: #8891a5;
          --accent: #d97757;   /* primary accent: rank numbers, winning bar fill, active tab/button states */
          --progress: #5AA9E6; /* progress bars, "On track" status */
          --amber: #f2b705;    /* "At risk" status */
          --danger: #e11d48;   /* "Behind" status — distinct from --accent so it never gets confused with a rank/active-state color */
        }
        * { box-sizing: border-box; }
        .app {
          background: var(--bg);
          color: var(--text);
          font-family: 'Lora', Georgia, serif;
          padding: 28px;
          min-height: 100%;
          border-radius: 12px;
        }
        .header { margin-bottom: 20px; }
        .eyebrow {
          font-family: 'Poppins', sans-serif;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 6px;
        }
        .title {
          font-family: 'Poppins', sans-serif;
          font-weight: 700;
          font-size: 34px;
          letter-spacing: 0.01em;
          margin: 0 0 4px 0;
        }
        .subtitle { color: var(--muted); font-size: 14px; margin: 0; }
        .tabs { display: flex; gap: 8px; margin: 22px 0; }
        .tab-btn {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--muted);
          padding: 9px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'Poppins', sans-serif;
        }
        .tab-btn.active { color: var(--text); background: var(--accent); border-color: var(--accent); }
        .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
        .controls-row { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-end; margin-bottom: 14px; }
        .select-wrap { display: flex; flex-direction: column; gap: 6px; }
        .select-label {
          font-family: 'Poppins', sans-serif;
          font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted);
        }
        .select {
          background: var(--surface-alt); color: var(--text); border: 1px solid var(--border);
          border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: 'Poppins', sans-serif; min-width: 170px;
        }
        .segctl { display: flex; gap: 4px; background: var(--surface-alt); padding: 3px; border-radius: 8px; border: 1px solid var(--border); }
        .segctl-btn {
          background: transparent; border: none; color: var(--muted); padding: 7px 12px; border-radius: 6px;
          font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'Poppins', sans-serif;
        }
        .segctl-btn.active { background: var(--accent); color: var(--text); }
        .row-head {
          display: grid; grid-template-columns: 32px 1.2fr 1.9fr 1fr 0.85fr; gap: 14px; padding: 0 14px 8px 14px;
          color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; font-family: 'Poppins', sans-serif;
        }
        .rows { display: flex; flex-direction: column; gap: 10px; }
        .empty { color: var(--muted); font-size: 13px; padding: 20px; text-align: center; }
        .row {
          display: grid; grid-template-columns: 32px 1.2fr 1.9fr 1fr 0.85fr; gap: 14px; align-items: start;
          background: var(--surface-alt); border: 1px solid var(--border); border-radius: 10px; padding: 14px;
        }
        .row-rank { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 20px; color: var(--accent); text-align: center; }
        .row-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .row-label-main { font-weight: 600; font-size: 14px; }
        .row-label-sub { color: var(--muted); font-size: 11px; }
        .row-stat { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .row-stat-label { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
        .row-stat-num { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 14px; }
        .row-stat-num-lg { font-size: 18px; }
        .row-stat-dim { color: var(--muted); font-weight: 500; font-size: 11px; }
        .row-stat-soft { color: var(--muted); font-size: 11px; margin-top: 2px; }
        .podium-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
        .podium-card { background: var(--surface-alt); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
        .podium-title { font-family: 'Poppins', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 10px; }
        .podium-empty { color: var(--muted); font-size: 12px; padding: 8px 0; }
        .podium-entry { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--border); }
        .podium-entry:first-child { border-top: none; }
        .podium-medal { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 12px; color: var(--muted); width: 30px; flex-shrink: 0; }
        .podium-name { flex: 1; font-size: 13px; font-weight: 600; color: var(--text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .podium-value { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 12px; color: var(--text); flex-shrink: 0; }
        .podium-rank-1 .podium-medal { color: var(--progress); font-size: 15px; }
        .podium-rank-1 .podium-name { color: var(--progress); font-size: 16px; }
        .podium-rank-1 .podium-value { color: var(--progress); font-size: 15px; }
        .progress-track { width: 100%; height: 10px; background: var(--border); border-radius: 5px; overflow: hidden; margin: 2px 0; }
        .progress-fill { height: 100%; background: var(--progress); border-radius: 5px; }
        .headline-card {
          display: flex; align-items: center; gap: 18px; background: var(--surface-alt);
          border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; margin-bottom: 18px;
        }
        .headline-num { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 46px; color: var(--progress); line-height: 1; }
        .headline-title { font-weight: 600; font-size: 15px; }
        .headline-sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
        .exec-table { display: flex; flex-direction: column; gap: 2px; }
        .exec-table-head, .exec-row {
          display: grid; grid-template-columns: 1.6fr 0.7fr 1.4fr 1fr 1fr; gap: 10px; align-items: center; padding: 10px 8px;
        }
        .exec-table-head { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; font-family: 'Poppins', sans-serif; }
        .exec-row { background: var(--surface-alt); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; }
        .exec-row-label { font-weight: 600; }
        .mini-bar { width: 70px; height: 5px; background: var(--bg); border-radius: 3px; display: inline-block; margin-right: 8px; vertical-align: middle; overflow: hidden; }
        .mini-bar-fill { height: 100%; background: var(--progress); }
        .pill {
          display: inline-flex; align-items: center; gap: 6px; border: 1px solid; border-radius: 20px;
          padding: 3px 10px; font-size: 11px; font-weight: 600;
        }
        .pill-dot { width: 6px; height: 6px; border-radius: 50%; }
        @media (max-width: 720px) {
          .exec-table-head, .exec-row { grid-template-columns: 1.4fr 0.6fr 1fr 0.8fr 0.9fr; font-size: 11px; }
          .title { font-size: 26px; }
          .podium-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="header">
        <div className="eyebrow">AI Practice Enablement · Mock Data</div>
        <h1 className="title">Wave Sprint</h1>
        <p className="subtitle">
          {data.length.toLocaleString()} synthetic practitioners across {WAVES.length} waves, {GEOS.length} geographies, {VERTICALS.length} verticals — standing in for live Skilljar progress + Credly badge data.
        </p>
      </div>

      <div className="tabs">
        <button className={"tab-btn" + (tab === "gamified" ? " active" : "")} onClick={() => setTab("gamified")}>Gamified Boards</button>
        <button className={"tab-btn" + (tab === "exec" ? " active" : "")} onClick={() => setTab("exec")}>Exec Dashboard</button>
      </div>

      {tab === "gamified" ? <GamifiedBoards data={data} /> : <ExecDashboard data={data} />}
    </div>
  );
}
