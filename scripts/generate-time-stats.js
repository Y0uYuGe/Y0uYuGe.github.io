const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const planRoot = process.env.LLK_PLAN_ROOT
  ? path.resolve(process.env.LLK_PLAN_ROOT)
  : path.resolve(repoRoot, '..', 'plan');
const outputPath = path.join(repoRoot, '_data', 'time_stats.json');

const timerKinds = ['work', 'meal', 'relax', 'sleep'];

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    return entry.isFile() && /^\d{4}-\d{2}\.md$/.test(entry.name) ? [fullPath] : [];
  });
}

function parseMonthData(content) {
  const match = /<!-- LLK_PLAN_MONTH_DATA\s*([\s\S]*?)\s*LLK_PLAN_MONTH_DATA -->/.exec(content);
  if (!match) {
    return undefined;
  }
  return JSON.parse(match[1]);
}

function dayKey(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseDay(day) {
  return new Date(`${day}T00:00:00`);
}

function isoWeekYear(date) {
  const target = new Date(date);
  const weekday = target.getDay() || 7;
  target.setDate(target.getDate() + 4 - weekday);
  return String(target.getFullYear());
}

function isoWeekNumber(date) {
  const target = new Date(date);
  const weekday = target.getDay() || 7;
  target.setDate(target.getDate() + 4 - weekday);
  const yearStart = new Date(target.getFullYear(), 0, 1);
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function weekInfo(day) {
  const date = parseDay(day);
  const weekday = date.getDay() || 7;
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - weekday + 1);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  const weekNumber = isoWeekNumber(date);
  return {
    key: `${isoWeekYear(date)}-W${String(weekNumber).padStart(2, '0')}`,
    start: dayKey(startDate),
    end: dayKey(endDate)
  };
}

function emptyTotals() {
  return Object.fromEntries(timerKinds.map(kind => [kind, 0]));
}

function addSession(weeks, session) {
  if (!session || !session.day || !timerKinds.includes(session.kind)) {
    return;
  }

  const minutes = Math.max(0, Math.round(Number(session.minutes) || 0));
  if (minutes <= 0) {
    return;
  }

  const week = weekInfo(session.day);
  const current = weeks.get(week.key) || {
    key: week.key,
    start: week.start,
    end: week.end,
    totals: emptyTotals(),
    days: {}
  };

  current.totals[session.kind] += minutes;
  current.days[session.day] ||= emptyTotals();
  current.days[session.day][session.kind] += minutes;
  weeks.set(week.key, current);
}

function hours(minutes) {
  return Number((minutes / 60).toFixed(2));
}

function buildStats() {
  const weeks = new Map();
  const sources = [];

  for (const file of walk(planRoot).sort()) {
    const content = fs.readFileSync(file, 'utf8');
    const monthData = parseMonthData(content);
    if (!monthData?.timers) {
      continue;
    }

    sources.push(path.relative(repoRoot, file));
    for (const sessions of Object.values(monthData.timers)) {
      if (!Array.isArray(sessions)) {
        continue;
      }
      for (const session of sessions) {
        addSession(weeks, session);
      }
    }
  }

  const sortedWeeks = Array.from(weeks.values())
    .sort((left, right) => right.start.localeCompare(left.start))
    .map(week => {
      const dayRows = Object.entries(week.days)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([day, totals]) => ({
          day,
          work_minutes: totals.work,
          work_hours: hours(totals.work),
          meal_minutes: totals.meal,
          relax_minutes: totals.relax,
          sleep_minutes: totals.sleep
        }));

      return {
        key: week.key,
        start: week.start,
        end: week.end,
        work_minutes: week.totals.work,
        work_hours: hours(week.totals.work),
        meal_minutes: week.totals.meal,
        meal_hours: hours(week.totals.meal),
        relax_minutes: week.totals.relax,
        relax_hours: hours(week.totals.relax),
        sleep_minutes: week.totals.sleep,
        sleep_hours: hours(week.totals.sleep),
        days: dayRows
      };
    });

  const maxWorkMinutes = Math.max(1, ...sortedWeeks.map(week => week.work_minutes));
  for (const week of sortedWeeks) {
    week.work_percent = Math.round((week.work_minutes / maxWorkMinutes) * 100);
  }

  const summary = sortedWeeks.reduce((acc, week) => {
    acc.work_minutes += week.work_minutes;
    acc.meal_minutes += week.meal_minutes;
    acc.relax_minutes += week.relax_minutes;
    acc.sleep_minutes += week.sleep_minutes;
    return acc;
  }, { work_minutes: 0, meal_minutes: 0, relax_minutes: 0, sleep_minutes: 0 });

  return {
    generated_at: new Date().toISOString(),
    source_root: path.relative(repoRoot, planRoot),
    sources,
    summary: {
      weeks_count: sortedWeeks.length,
      work_minutes: summary.work_minutes,
      work_hours: hours(summary.work_minutes),
      meal_hours: hours(summary.meal_minutes),
      relax_hours: hours(summary.relax_minutes),
      sleep_hours: hours(summary.sleep_minutes)
    },
    weeks: sortedWeeks
  };
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(buildStats(), null, 2)}\n`, 'utf8');
console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
