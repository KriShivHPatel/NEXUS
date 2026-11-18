// Validators turn raw form input into normalised records. They never touch the database.
// Each returns { valid, errors, value } where errors maps field names to messages.

import { isDateKey, isTimeValue, diffDays } from './dates.js';
import {
  TASK_CATEGORIES,
  PRIORITY_VALUES,
  UNDERSTANDING_LEVELS,
  PROJECT_STATUSES,
  PROJECT_CATEGORIES,
  JOURNAL_CATEGORIES,
} from './constants.js';
import { RECURRENCE_VALUES } from './recurrence.js';

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function bool(value) {
  return value === true || value === 'true' || value === 'on';
}

function outcome(errors, value) {
  return { valid: Object.keys(errors).length === 0, errors, value };
}

function optionalDate(raw, errors, field, label) {
  const value = text(raw);
  if (!value) return null;
  if (!isDateKey(value)) {
    errors[field] = `${label} must be a real calendar date.`;
    return null;
  }
  return value;
}

// Accepts numbers or numeric strings. Blank input yields null.
function optionalNumber(raw, errors, field, label, { min, max, integer = false }) {
  const value = typeof raw === 'number' ? String(raw) : text(raw);
  if (value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    errors[field] = `${label} must be a number.`;
    return null;
  }
  if (integer && !Number.isInteger(number)) {
    errors[field] = `${label} must be a whole number.`;
    return null;
  }
  if (number < min || number > max) {
    errors[field] = `${label} must be between ${min} and ${max}.`;
    return null;
  }
  return number;
}

function requiredNumber(raw, errors, field, label, bounds) {
  const number = optionalNumber(raw, errors, field, label, bounds);
  if (number === null && !errors[field]) errors[field] = `${label} is required.`;
  return number;
}

function parseTags(raw, errors, { maxTags = 10, maxLength = 24 } = {}) {
  const list = Array.isArray(raw) ? raw : text(raw).split(',');
  const tags = [...new Set(list.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
  if (tags.length > maxTags) errors.tags = `Use at most ${maxTags} tags.`;
  else if (tags.some((tag) => tag.length > maxLength)) errors.tags = `Each tag must be ${maxLength} characters or fewer.`;
  return tags;
}

export function validateTask(input) {
  const errors = {};
  const title = text(input.title);
  if (!title) errors.title = 'Enter a title for this task.';
  else if (title.length > 140) errors.title = 'Titles can be at most 140 characters.';

  const description = text(input.description);
  if (description.length > 2000) errors.description = 'Descriptions can be at most 2000 characters.';

  if (!TASK_CATEGORIES.some((item) => item.value === input.category)) errors.category = 'Choose a category.';
  if (!PRIORITY_VALUES.includes(input.priority)) errors.priority = 'Choose a priority.';

  const dueDate = optionalDate(input.dueDate, errors, 'dueDate', 'Due date');
  const rawTime = text(input.dueTime);
  let dueTime = null;
  if (rawTime) {
    if (!isTimeValue(rawTime)) errors.dueTime = 'Enter a time in 24-hour format, such as 14:30.';
    else dueTime = rawTime;
  }
  if (dueTime && !dueDate) errors.dueTime = 'Set a due date before adding a due time.';

  const recurrence = input.recurrence || 'none';
  if (!RECURRENCE_VALUES.includes(recurrence)) errors.recurrence = 'Choose a valid repeat option.';
  if (recurrence !== 'none' && !dueDate) errors.dueDate = 'Repeating tasks need a due date.';

  const tags = parseTags(input.tags, errors);
  const projectId = text(input.projectId) || null;
  const anchorDay = dueDate && recurrence === 'monthly' ? Number(dueDate.slice(8, 10)) : null;

  return outcome(errors, {
    title,
    description,
    category: input.category,
    priority: input.priority,
    dueDate,
    dueTime,
    recurrence,
    anchorDay,
    tags,
    projectId,
  });
}

export function validateObjective(input) {
  const errors = {};
  const value = text(input.text);
  if (!value) errors.text = 'Describe the objective.';
  else if (value.length > 120) errors.text = 'Objectives can be at most 120 characters.';
  if (!PRIORITY_VALUES.includes(input.priority)) errors.priority = 'Choose a priority.';
  return outcome(errors, { text: value, priority: input.priority });
}

export function validateHabit(input) {
  const errors = {};
  const name = text(input.name);
  if (!name) errors.name = 'Name the habit.';
  else if (name.length > 60) errors.name = 'Habit names can be at most 60 characters.';
  return outcome(errors, { name });
}

export function validateSemester(input) {
  const errors = {};
  const name = text(input.name);
  if (!name) errors.name = 'Name the semester.';
  else if (name.length > 80) errors.name = 'Semester names can be at most 80 characters.';
  const academicYear = text(input.academicYear);
  if (academicYear.length > 20) errors.academicYear = 'Academic year can be at most 20 characters.';
  const startDate = optionalDate(input.startDate, errors, 'startDate', 'Start date');
  const endDate = optionalDate(input.endDate, errors, 'endDate', 'End date');
  if (startDate && endDate && diffDays(startDate, endDate) < 0) errors.endDate = 'End date cannot be before the start date.';
  return outcome(errors, { name, academicYear, startDate, endDate });
}

export function validateSubject(input) {
  const errors = {};
  const name = text(input.name);
  if (!name) errors.name = 'Name the subject.';
  else if (name.length > 120) errors.name = 'Subject names can be at most 120 characters.';
  const code = text(input.code);
  if (code.length > 20) errors.code = 'Subject codes can be at most 20 characters.';
  const credits = optionalNumber(input.credits, errors, 'credits', 'Credits', { min: 0, max: 30 });
  const faculty = text(input.faculty);
  if (faculty.length > 80) errors.faculty = 'Faculty names can be at most 80 characters.';
  const targetMarks = optionalNumber(input.targetMarks, errors, 'targetMarks', 'Target marks', { min: 0, max: 100 });
  const currentMarks = optionalNumber(input.currentMarks, errors, 'currentMarks', 'Current marks', { min: 0, max: 100 });
  const semesterId = text(input.semesterId);
  if (!semesterId) errors.semesterId = 'Choose a semester.';
  return outcome(errors, { name, code, credits, faculty, targetMarks, currentMarks, semesterId });
}

export function validateUnit(input) {
  const errors = {};
  const name = text(input.name);
  if (!name) errors.name = 'Name the unit.';
  else if (name.length > 120) errors.name = 'Unit names can be at most 120 characters.';
  return outcome(errors, { name });
}

export function validateTopic(input) {
  const errors = {};
  const name = text(input.name);
  if (!name) errors.name = 'Name the topic.';
  else if (name.length > 140) errors.name = 'Topic names can be at most 140 characters.';
  if (!UNDERSTANDING_LEVELS.some((level) => level.value === input.understanding)) {
    errors.understanding = 'Choose an understanding level.';
  }
  const notes = text(input.notes);
  if (notes.length > 2000) errors.notes = 'Notes can be at most 2000 characters.';
  const lastRevised = optionalDate(input.lastRevised, errors, 'lastRevised', 'Last revised date');
  const nextRevision = optionalDate(input.nextRevision, errors, 'nextRevision', 'Next revision date');
  return outcome(errors, {
    name,
    unitId: text(input.unitId) || null,
    completed: bool(input.completed),
    understanding: input.understanding,
    lastRevised,
    nextRevision,
    notes,
  });
}

export function validateAssignment(input) {
  const errors = {};
  const title = text(input.title);
  if (!title) errors.title = 'Name the assignment.';
  else if (title.length > 140) errors.title = 'Assignment names can be at most 140 characters.';
  const dueDate = optionalDate(input.dueDate, errors, 'dueDate', 'Due date');
  return outcome(errors, { title, dueDate, done: bool(input.done) });
}

export function validateExam(input) {
  const errors = {};
  const name = text(input.name);
  if (!name) errors.name = 'Name the examination.';
  else if (name.length > 120) errors.name = 'Examination names can be at most 120 characters.';
  const date = optionalDate(input.date, errors, 'date', 'Exam date');
  if (!date && !errors.date) errors.date = 'Choose the exam date.';
  const notes = text(input.notes);
  if (notes.length > 500) errors.notes = 'Notes can be at most 500 characters.';
  return outcome(errors, { name, date, notes });
}

export function validateLeetcodeDay(input) {
  const errors = {};
  const date = optionalDate(input.date, errors, 'date', 'Date');
  if (!date && !errors.date) errors.date = 'Choose the practice date.';
  const easy = optionalNumber(input.easy, errors, 'easy', 'Easy problems', { min: 0, max: 500, integer: true }) ?? 0;
  const medium = optionalNumber(input.medium, errors, 'medium', 'Medium problems', { min: 0, max: 500, integer: true }) ?? 0;
  const hard = optionalNumber(input.hard, errors, 'hard', 'Hard problems', { min: 0, max: 500, integer: true }) ?? 0;
  const topics = parseTags(input.topics, errors, { maxTags: 30, maxLength: 40 });
  return outcome(errors, { id: date, date, easy, medium, hard, topics });
}

export function validateProject(input) {
  const errors = {};
  const name = text(input.name);
  if (!name) errors.name = 'Name the project.';
  else if (name.length > 120) errors.name = 'Project names can be at most 120 characters.';
  const description = text(input.description);
  if (description.length > 2000) errors.description = 'Descriptions can be at most 2000 characters.';
  if (!PROJECT_CATEGORIES.some((item) => item.value === input.category)) errors.category = 'Choose a category.';
  if (!PROJECT_STATUSES.some((item) => item.value === input.status)) errors.status = 'Choose a status.';
  if (!PRIORITY_VALUES.includes(input.priority)) errors.priority = 'Choose a priority.';
  const startDate = optionalDate(input.startDate, errors, 'startDate', 'Start date');
  const targetDate = optionalDate(input.targetDate, errors, 'targetDate', 'Target date');
  if (startDate && targetDate && diffDays(startDate, targetDate) < 0) {
    errors.targetDate = 'Target date cannot be before the start date.';
  }
  const notes = text(input.notes);
  if (notes.length > 10000) errors.notes = 'Notes can be at most 10000 characters.';
  return outcome(errors, {
    name,
    description,
    category: input.category,
    status: input.status,
    priority: input.priority,
    startDate,
    targetDate,
    notes,
  });
}

export function validateMilestone(input) {
  const errors = {};
  const title = text(input.title);
  if (!title) errors.title = 'Name the milestone.';
  else if (title.length > 140) errors.title = 'Milestone names can be at most 140 characters.';
  const dueDate = optionalDate(input.dueDate, errors, 'dueDate', 'Due date');
  return outcome(errors, { title, dueDate });
}

export function validateJournal(input) {
  const errors = {};
  const content = text(input.content);
  let title = text(input.title);
  if (content.length > 10000) errors.content = 'Entries can be at most 10000 characters.';
  if (title.length > 120) errors.title = 'Titles can be at most 120 characters.';
  if (!title && !content) errors.content = 'Write something before saving.';
  if (!title && content) title = content.split('\n')[0].slice(0, 60);
  if (!JOURNAL_CATEGORIES.some((item) => item.value === input.category)) errors.category = 'Choose a category.';
  const tags = parseTags(input.tags, errors);
  return outcome(errors, { title, content, category: input.category, tags });
}

export function validatePreferences(input) {
  const errors = {};
  const name = text(input.name);
  if (name.length > 60) errors.name = 'Names can be at most 60 characters.';
  const university = text(input.university);
  if (university.length > 100) errors.university = 'University names can be at most 100 characters.';
  const dailyFocusMinutes = requiredNumber(input.dailyFocusMinutes, errors, 'dailyFocusMinutes', 'Daily focus target', {
    min: 15,
    max: 1440,
    integer: true,
  });
  const lookaheadDays = requiredNumber(input.lookaheadDays, errors, 'lookaheadDays', 'Deadline lookahead', {
    min: 1,
    max: 14,
    integer: true,
  });
  const examDays = requiredNumber(input.examDays, errors, 'examDays', 'Exam warning window', {
    min: 1,
    max: 60,
    integer: true,
  });
  if (!TASK_CATEGORIES.some((item) => item.value === input.defaultCategory)) errors.defaultCategory = 'Choose a category.';
  if (!PRIORITY_VALUES.includes(input.defaultPriority)) errors.defaultPriority = 'Choose a priority.';
  return outcome(errors, {
    name,
    university,
    dailyFocusMinutes,
    lookaheadDays,
    examDays,
    defaultCategory: input.defaultCategory,
    defaultPriority: input.defaultPriority,
  });
}
