// Analytics are derived from stored records. Nothing here is invented or cached.
// Measured values: completions, focused minutes, habit logs. Calculated indicators: rates and the productivity score.

import { dateKeyOfIso, addDays } from './dates.js';
import { projectProgress } from './projects.js';

export function completionsOn(tasks, day) {
  let count = 0;
  for (const task of tasks) {
    for (const iso of task.completions ?? []) {
      if (dateKeyOfIso(iso) === day) count += 1;
    }
  }
  return count;
}

// Open tasks whose due date has already passed as of the given day.
export function missedOn(tasks, day, today, nowTime) {
  return tasks.filter((task) => {
    if (task.status === 'done' || task.dueDate !== day) return false;
    if (day < today) return true;
    return day === today && Boolean(task.dueTime) && task.dueTime < nowTime;
  }).length;
}

export function focusMinutesOn(sessions, day) {
  let seconds = 0;
  for (const session of sessions) {
    if (dateKeyOfIso(session.startedAt) === day) seconds += session.focusedSec ?? 0;
  }
  return seconds / 60;
}

export function habitLogSet(logs) {
  return new Set(logs.map((log) => `${log.habitId}|${log.date}`));
}

function activeHabits(habits) {
  return habits.filter((habit) => habit.active !== false);
}

// A day is complete when every active habit is logged. The streak counts back from today,
// but today is not counted as broken until it ends, so the streak runs through yesterday until today is complete.
export function habitStreak(habits, logs, today) {
  const active = activeHabits(habits);
  if (active.length === 0) return 0;
  const logged = habitLogSet(logs);
  const dayComplete = (day) => active.every((habit) => logged.has(`${habit.id}|${day}`));
  let cursor = dayComplete(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dayComplete(cursor) && streak < 3650) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function productivityScore({ taskRate, habitRate, focusRate }) {
  const parts = [
    [taskRate, 0.4],
    [habitRate, 0.3],
    [focusRate, 0.3],
  ].filter(([value]) => value !== null);
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
  const weighted = parts.reduce((sum, [value, weight]) => sum + value * weight, 0);
  return Math.round((weighted / totalWeight) * 100);
}

export function daySummary(day, data) {
  const { tasks, sessions, habits, logs, focusTarget, today, nowTime } = data;
  const active = activeHabits(habits);
  const logged = habitLogSet(logs);

  const tasksCompleted = completionsOn(tasks, day);
  const tasksMissed = missedOn(tasks, day, today, nowTime);
  const focusMinutes = focusMinutesOn(sessions, day);
  const habitsDone = active.filter((habit) => logged.has(`${habit.id}|${day}`)).length;

  const taskTotal = tasksCompleted + tasksMissed;
  const taskRate = taskTotal > 0 ? Math.min(tasksCompleted / taskTotal, 1) : null;
  const habitRate = active.length > 0 ? habitsDone / active.length : null;
  const focusRate = focusTarget > 0 ? Math.min(focusMinutes / focusTarget, 1) : null;

  return {
    day,
    tasksCompleted,
    tasksMissed,
    focusMinutes,
    habitsDone,
    habitsActive: active.length,
    taskRate,
    habitRate,
    focusRate,
    score: productivityScore({ taskRate, habitRate, focusRate }),
  };
}

export function windowSummary(days, data) {
  const summaries = days.map((day) => daySummary(day, data));
  const completed = summaries.reduce((sum, item) => sum + item.tasksCompleted, 0);
  const missed = summaries.reduce((sum, item) => sum + item.tasksMissed, 0);
  const focusMinutes = summaries.reduce((sum, item) => sum + item.focusMinutes, 0);
  const daysWithHabits = summaries.filter((item) => item.habitsDone > 0).length;
  const scored = summaries.filter((item) => item.score !== null);
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length)
    : null;
  const bestDay = scored.reduce((best, item) => (!best || item.score > best.score ? item : best), null);

  return {
    summaries,
    completed,
    missed,
    focusMinutes,
    completionRate: completed + missed > 0 ? completed / (completed + missed) : null,
    habitConsistency: days.length ? daysWithHabits / days.length : null,
    averageScore,
    mostProductiveDay: bestDay && bestDay.score > 0 ? bestDay.day : null,
  };
}


// Point-in-time progress values. Stored once per day the app runs, so trends only exist for recorded days.
export function progressSnapshot({ topics = [], projects = [], milestones = [], tasks = [] }, day) {
  const completedTopics = topics.filter((topic) => topic.completed).length;
  const academic = topics.length > 0 ? Math.round((completedTopics / topics.length) * 100) : null;

  const active = projects.filter((project) => project.status === 'active');
  const percents = active
    .map((project) =>
      projectProgress(
        milestones.filter((item) => item.projectId === project.id),
        tasks.filter((item) => item.projectId === project.id)
      ).percent
    )
    .filter((value) => value !== null);
  const projectAverage = percents.length > 0 ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length) : null;

  return { day, academic, projects: projectAverage, activeProjects: active.length };
}
