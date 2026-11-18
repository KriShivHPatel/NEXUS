// Project progress is derived from milestones and linked tasks. There are no stored percentages.

import { diffDays } from './dates.js';

export function projectProgress(milestones, tasks) {
  const total = milestones.length + tasks.length;
  const done =
    milestones.filter((milestone) => milestone.done).length +
    tasks.filter((task) => task.status === 'done').length;
  return { total, done, percent: total > 0 ? Math.round((done / total) * 100) : null };
}

function byDueThenCreated(a, b) {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
}

export function openMilestones(milestones) {
  return milestones.filter((milestone) => !milestone.done).sort(byDueThenCreated);
}

export function nextActionFor(milestones, tasks) {
  const milestone = openMilestones(milestones)[0];
  if (milestone) return milestone.title;
  const task = tasks.filter((item) => item.status !== 'done').sort(byDueThenCreated)[0];
  return task ? task.title : null;
}

// Position of each milestone along the project's start-to-target span, clamped to 0..1.
export function projectTimeline(project, milestones, today) {
  if (!project.startDate || !project.targetDate) return null;
  const span = Math.max(1, diffDays(project.startDate, project.targetDate));
  const position = (dateKey) => Math.min(1, Math.max(0, diffDays(project.startDate, dateKey) / span));
  return {
    span,
    todayRatio: position(today),
    markers: milestones
      .filter((milestone) => milestone.dueDate)
      .map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        done: Boolean(milestone.done),
        ratio: position(milestone.dueDate),
        dueDate: milestone.dueDate,
      })),
  };
}

export function completionHistory(milestones, tasks) {
  const events = [];
  for (const milestone of milestones) {
    if (milestone.done && milestone.completedAt) {
      events.push({ type: 'milestone', title: milestone.title, at: milestone.completedAt });
    }
  }
  for (const task of tasks) {
    if (task.status === 'done' && task.completedAt) {
      events.push({ type: 'task', title: task.title, at: task.completedAt });
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
