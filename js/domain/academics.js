// Academic rules. Progress is derived from topic completion flags. Revision dates come from understanding levels.

import { addDays, diffDays } from './dates.js';
import { UNDERSTANDING_LEVELS } from './constants.js';

export function nextRevisionFor(understanding, today) {
  const level = UNDERSTANDING_LEVELS.find((item) => item.value === understanding);
  if (!level || level.revisionDays === null) return null;
  return addDays(today, level.revisionDays);
}

export function subjectProgress(topics) {
  const total = topics.length;
  const completed = topics.filter((topic) => topic.completed).length;
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : null };
}

export function revisionDue(topics, today) {
  return topics.filter(
    (topic) => topic.nextRevision && topic.nextRevision <= today && topic.understanding !== 'mastered'
  );
}

export function upcomingExams(exams, today, withinDays) {
  return exams
    .filter((exam) => {
      const diff = diffDays(today, exam.date);
      return diff >= 0 && diff <= withinDays;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function nextExam(exams, subjectId, today) {
  return (
    exams
      .filter((exam) => exam.subjectId === subjectId && exam.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}

export function pendingAssignments(assignments, subjectId) {
  return assignments.filter((assignment) => assignment.subjectId === subjectId && !assignment.done);
}

// Positive means marks still to gain. Null when either value is not recorded.
export function marksGap(subject) {
  if (subject.targetMarks == null || subject.currentMarks == null) return null;
  return subject.targetMarks - subject.currentMarks;
}
