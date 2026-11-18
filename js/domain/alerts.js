// Deadline radar. Every alert maps to a real record. Nothing is generated speculatively.

import { diffDays, relativeDayLabel } from './dates.js';
import { isOpen, isOverdue } from './tasks.js';

const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2 };

export function buildAlerts(context) {
  const {
    tasks = [],
    objectives = [],
    exams = [],
    assignments = [],
    topics = [],
    subjects = [],
    today,
    nowTime,
    prefs,
  } = context;
  const enabled = prefs.notifications;
  const lookahead = prefs.lookaheadDays;
  const examWindow = prefs.examDays;
  const subjectName = (id) => subjects.find((subject) => subject.id === id)?.name ?? 'No subject';
  const alerts = [];

  if (enabled.overdue) {
    for (const task of tasks) {
      if (!isOverdue(task, today, nowTime)) continue;
      alerts.push({
        id: `overdue:${task.id}`,
        kind: 'overdue',
        severity: 'danger',
        title: task.title,
        detail: `Overdue, was due ${relativeDayLabel(task.dueDate, today).toLowerCase()}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
        route: 'tasks',
      });
    }
  }

  if (enabled.dueSoon) {
    for (const task of tasks) {
      if (!isOpen(task) || !task.dueDate || isOverdue(task, today, nowTime)) continue;
      const diff = diffDays(today, task.dueDate);
      if (diff === 0) {
        alerts.push({
          id: `today:${task.id}`,
          kind: 'dueSoon',
          severity: 'warning',
          title: task.title,
          detail: `Due today${task.dueTime ? ` at ${task.dueTime}` : ''}`,
          route: 'tasks',
        });
      } else if (diff > 0 && diff <= lookahead) {
        alerts.push({
          id: `soon:${task.id}`,
          kind: 'dueSoon',
          severity: 'info',
          title: task.title,
          detail: `Due ${relativeDayLabel(task.dueDate, today).toLowerCase()}`,
          route: 'tasks',
        });
      }
    }
  }

  if (enabled.exams) {
    for (const exam of exams) {
      const diff = diffDays(today, exam.date);
      if (diff < 0 || diff > examWindow) continue;
      alerts.push({
        id: `exam:${exam.id}`,
        kind: 'exams',
        severity: 'warning',
        title: exam.name,
        detail: `${subjectName(exam.subjectId)}, ${relativeDayLabel(exam.date, today).toLowerCase()}`,
        route: 'academics',
      });
    }
  }

  if (enabled.assignments) {
    for (const assignment of assignments) {
      if (assignment.done || !assignment.dueDate) continue;
      const diff = diffDays(today, assignment.dueDate);
      if (diff < 0) {
        alerts.push({
          id: `assignment:${assignment.id}`,
          kind: 'assignments',
          severity: 'danger',
          title: assignment.title,
          detail: `Assignment overdue, ${subjectName(assignment.subjectId)}`,
          route: 'academics',
        });
      } else if (diff <= lookahead) {
        alerts.push({
          id: `assignment:${assignment.id}`,
          kind: 'assignments',
          severity: 'warning',
          title: assignment.title,
          detail: `Assignment due ${relativeDayLabel(assignment.dueDate, today).toLowerCase()}, ${subjectName(assignment.subjectId)}`,
          route: 'academics',
        });
      }
    }
  }

  if (enabled.objectives) {
    const todays = objectives.filter((objective) => objective.date === today);
    const open = todays.filter((objective) => !objective.done);
    if (open.length > 0) {
      alerts.push({
        id: `objectives:${today}`,
        kind: 'objectives',
        severity: 'info',
        title: 'Objectives still open',
        detail: `${open.length} of ${todays.length} for today`,
        route: 'overview',
      });
    }
  }

  if (enabled.revisions) {
    for (const topic of topics) {
      if (!topic.nextRevision || topic.nextRevision > today || topic.understanding === 'mastered') continue;
      alerts.push({
        id: `revision:${topic.id}`,
        kind: 'revisions',
        severity: 'info',
        title: topic.name,
        detail: `Revision due, ${subjectName(topic.subjectId)}`,
        route: 'academics',
      });
    }
  }

  return alerts
    .map((alert, index) => ({ alert, index }))
    .sort((a, b) => SEVERITY_ORDER[a.alert.severity] - SEVERITY_ORDER[b.alert.severity] || a.index - b.index)
    .map(({ alert }) => alert);
}
