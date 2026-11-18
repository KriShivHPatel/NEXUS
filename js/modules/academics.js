// Academic intelligence. Hierarchy: University > Academic year > Semester > Subject > Unit > Topic.
// Overview is computed from stored topics, assignments and exams. Nothing is estimated.

import { loadSnapshot, repos, createRecord, updateRecord, deleteRecord, putRecord, commitOperations } from '../data.js';
import { on } from '../bus.js';
import { icon, escapeHtml } from '../utilities.js';
import { toDateKey, relativeDayLabel, formatDateKey, lastDays, nowIso } from '../domain/dates.js';
import { UNDERSTANDING_LEVELS, resolvePreferences } from '../domain/constants.js';
import {
  nextRevisionFor,
  subjectProgress,
  revisionDue,
  upcomingExams,
  nextExam,
  pendingAssignments,
  marksGap,
} from '../domain/academics.js';
import {
  validateSemester,
  validateSubject,
  validateUnit,
  validateTopic,
  validateAssignment,
  validateExam,
  validateLeetcodeDay,
} from '../domain/validation.js';
import { field, openFormModal } from '../components/forms.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { safely } from '../actions.js';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'subjects', label: 'Subjects' },
  { value: 'leetcode', label: 'LeetCode' },
];

const EXAM_WINDOW_DAYS = 60;

function percentText(value) {
  return value === null ? '–' : `${value}%`;
}

function barMarkup(percent) {
  const width = percent ?? 0;
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width}"><span style="width:${width}%"></span></div>`;
}

function understandingLabel(value) {
  return UNDERSTANDING_LEVELS.find((level) => level.value === value)?.label ?? 'Not started';
}

function semesterLabel(semester, universityName) {
  const parts = [universityName, semester?.academicYear, semester?.name].filter(Boolean);
  return parts.join(' · ');
}

// ---------- Forms ----------

function semesterFields(initial = {}) {
  return [
    field({ name: 'name', label: 'Semester name', value: initial.name ?? '', required: true, placeholder: 'For example: Semester 3', full: true }),
    field({ name: 'academicYear', label: 'Academic year', value: initial.academicYear ?? '', placeholder: '2026-27' }),
    field({ name: 'startDate', label: 'Start date', type: 'date', value: initial.startDate ?? '' }),
    field({ name: 'endDate', label: 'End date', type: 'date', value: initial.endDate ?? '' }),
  ].join('');
}

function subjectFields(initial, semesters) {
  const semesterOptions = semesters.map((semester) => ({ value: semester.id, label: semester.name }));
  return [
    field({ name: 'name', label: 'Subject name', value: initial.name ?? '', required: true, full: true }),
    field({ name: 'code', label: 'Subject code', value: initial.code ?? '', placeholder: 'CS301' }),
    field({ name: 'credits', label: 'Credits', type: 'number', value: initial.credits ?? '', min: 0, max: 30, step: 'any' }),
    field({ name: 'faculty', label: 'Faculty (optional)', value: initial.faculty ?? '' }),
    field({ name: 'semesterId', label: 'Semester', type: 'select', value: initial.semesterId ?? semesterOptions[0]?.value ?? '', options: semesterOptions }),
    field({ name: 'targetMarks', label: 'Target marks', type: 'number', value: initial.targetMarks ?? '', min: 0, max: 100, step: 'any', hint: 'Out of 100' }),
    field({ name: 'currentMarks', label: 'Current marks', type: 'number', value: initial.currentMarks ?? '', min: 0, max: 100, step: 'any', hint: 'Out of 100' }),
  ].join('');
}

function unitFields(initial = {}) {
  return field({ name: 'name', label: 'Unit name', value: initial.name ?? '', required: true, full: true, placeholder: 'For example: Unit 2, Trees and graphs' });
}

function topicFields(initial, units) {
  const unitOptions = [{ value: '', label: 'No unit' }, ...units.map((unit) => ({ value: unit.id, label: unit.name }))];
  return [
    field({ name: 'name', label: 'Topic', value: initial.name ?? '', required: true, full: true }),
    field({ name: 'unitId', label: 'Unit', type: 'select', value: initial.unitId ?? '', options: unitOptions }),
    field({
      name: 'understanding',
      label: 'Understanding',
      type: 'select',
      value: initial.understanding ?? 'notStarted',
      options: UNDERSTANDING_LEVELS.map((level) => ({ value: level.value, label: level.label })),
    }),
    field({ name: 'completed', label: 'Topic completed', type: 'checkbox', value: Boolean(initial.completed) }),
    field({ name: 'lastRevised', label: 'Last revised', type: 'date', value: initial.lastRevised ?? '' }),
    field({ name: 'nextRevision', label: 'Next revision', type: 'date', value: initial.nextRevision ?? '', hint: 'Set automatically when you mark a topic revised.' }),
    field({ name: 'notes', label: 'Personal notes', type: 'textarea', value: initial.notes ?? '', full: true, rows: 3 }),
  ].join('');
}

function assignmentFields(initial = {}) {
  return [
    field({ name: 'title', label: 'Assignment', value: initial.title ?? '', required: true, full: true }),
    field({ name: 'dueDate', label: 'Due date', type: 'date', value: initial.dueDate ?? '' }),
  ].join('');
}

function examFields(initial = {}) {
  return [
    field({ name: 'name', label: 'Examination', value: initial.name ?? '', required: true, placeholder: 'For example: Mid-semester', full: true }),
    field({ name: 'date', label: 'Date', type: 'date', value: initial.date ?? '', required: true }),
    field({ name: 'notes', label: 'Notes', value: initial.notes ?? '', full: true, placeholder: 'Syllabus range, venue, rules' }),
  ].join('');
}

function leetcodeFields(initial = {}, today) {
  return [
    field({ name: 'date', label: 'Date', type: 'date', value: initial.date ?? today, required: true }),
    field({ name: 'easy', label: 'Easy solved', type: 'number', value: initial.easy ?? 0, min: 0, max: 500, step: 1 }),
    field({ name: 'medium', label: 'Medium solved', type: 'number', value: initial.medium ?? 0, min: 0, max: 500, step: 1 }),
    field({ name: 'hard', label: 'Hard solved', type: 'number', value: initial.hard ?? 0, min: 0, max: 500, step: 1 }),
    field({ name: 'topics', label: 'Topics practised', value: (initial.topics ?? []).join(', '), full: true, placeholder: 'arrays, dynamic programming', hint: 'Separate topics with commas.' }),
  ].join('');
}

// ---------- Actions ----------

function openSemesterForm(semester = null) {
  return openFormModal({
    title: semester ? 'Edit semester' : 'New semester',
    html: semesterFields(semester ?? {}),
    validate: validateSemester,
    size: 'md',
    submitLabel: semester ? 'Save changes' : 'Create semester',
    onSubmit: async (value) => {
      if (semester) await updateRecord('semesters', semester.id, value);
      else await createRecord('semesters', value);
      toast(semester ? 'Semester updated.' : 'Semester created.', 'success');
    },
  });
}

async function removeSemester(id) {
  const semester = await repos.semesters.get(id);
  if (!semester) throw new Error('That semester no longer exists.');
  const subjects = await repos.subjects.byIndex('semesterId', id);
  if (subjects.length > 0) {
    throw new Error(`Delete or move the ${subjects.length} subject${subjects.length === 1 ? '' : 's'} in ${semester.name} first.`);
  }
  const confirmed = await confirmDialog({ title: 'Delete semester?', message: `Delete ${semester.name}? This cannot be undone.`, confirmLabel: 'Delete', danger: true });
  if (!confirmed) return;
  await deleteRecord('semesters', id);
  toast('Semester deleted.', 'success');
}

function openSubjectForm(subject, semesters) {
  if (semesters.length === 0) throw new Error('Create a semester before adding subjects.');
  return openFormModal({
    title: subject ? 'Edit subject' : 'New subject',
    html: subjectFields(subject ?? {}, semesters),
    validate: validateSubject,
    size: 'lg',
    submitLabel: subject ? 'Save changes' : 'Create subject',
    onSubmit: async (value) => {
      if (subject) await updateRecord('subjects', subject.id, value);
      else await createRecord('subjects', value);
      toast(subject ? 'Subject updated.' : 'Subject created.', 'success');
    },
  });
}

async function removeSubject(id) {
  const subject = await repos.subjects.get(id);
  if (!subject) throw new Error('That subject no longer exists.');
  const confirmed = await confirmDialog({
    title: 'Delete subject?',
    message: `Delete ${subject.name} with all its units, topics, assignments and exams? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  const [units, topics, assignments, exams] = await Promise.all([
    repos.units.byIndex('subjectId', id),
    repos.topics.byIndex('subjectId', id),
    repos.assignments.byIndex('subjectId', id),
    repos.exams.byIndex('subjectId', id),
  ]);
  await commitOperations(
    [
      ...units.map((item) => ({ type: 'delete', store: 'units', id: item.id })),
      ...topics.map((item) => ({ type: 'delete', store: 'topics', id: item.id })),
      ...assignments.map((item) => ({ type: 'delete', store: 'assignments', id: item.id })),
      ...exams.map((item) => ({ type: 'delete', store: 'exams', id: item.id })),
      { type: 'delete', store: 'subjects', id },
    ],
    'subjects'
  );
  toast('Subject deleted.', 'success');
}

function openUnitForm(subjectId, unit = null) {
  return openFormModal({
    title: unit ? 'Edit unit' : 'New unit',
    html: unitFields(unit ?? {}),
    validate: validateUnit,
    size: 'sm',
    submitLabel: unit ? 'Save changes' : 'Add unit',
    onSubmit: async (value) => {
      if (unit) await updateRecord('units', unit.id, value);
      else await createRecord('units', { ...value, subjectId });
      toast(unit ? 'Unit updated.' : 'Unit added.', 'success');
    },
  });
}

async function removeUnit(id) {
  const unit = await repos.units.get(id);
  if (!unit) throw new Error('That unit no longer exists.');
  const confirmed = await confirmDialog({
    title: 'Delete unit?',
    message: `Delete ${unit.name}? Its topics are kept and become unassigned.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  const topics = await repos.topics.byIndex('unitId', id);
  const now = nowIso();
  await commitOperations(
    [
      ...topics.map((topic) => ({ type: 'put', store: 'topics', record: { ...topic, unitId: null, updatedAt: now } })),
      { type: 'delete', store: 'units', id },
    ],
    'units'
  );
  toast('Unit deleted.', 'success');
}

function openTopicForm(subjectId, units, topic = null, presetUnitId = '') {
  const initial = topic ?? { unitId: presetUnitId, understanding: 'notStarted' };
  return openFormModal({
    title: topic ? 'Edit topic' : 'New topic',
    html: topicFields(initial, units),
    validate: validateTopic,
    size: 'lg',
    submitLabel: topic ? 'Save changes' : 'Add topic',
    onSubmit: async (value) => {
      if (topic) await updateRecord('topics', topic.id, value);
      else await createRecord('topics', { ...value, subjectId });
      toast(topic ? 'Topic updated.' : 'Topic added.', 'success');
    },
  });
}

async function markRevised(id, today) {
  const topic = await repos.topics.get(id);
  if (!topic) throw new Error('That topic no longer exists.');
  await updateRecord('topics', id, {
    lastRevised: today,
    nextRevision: nextRevisionFor(topic.understanding, today),
  });
  toast('Revision recorded.', 'success');
}

function openAssignmentForm(subjectId, assignment = null) {
  return openFormModal({
    title: assignment ? 'Edit assignment' : 'New assignment',
    html: assignmentFields(assignment ?? {}),
    validate: validateAssignment,
    size: 'sm',
    submitLabel: assignment ? 'Save changes' : 'Add assignment',
    onSubmit: async (value) => {
      if (assignment) await updateRecord('assignments', assignment.id, value);
      else await createRecord('assignments', { ...value, subjectId });
      toast(assignment ? 'Assignment updated.' : 'Assignment added.', 'success');
    },
  });
}

function openExamForm(subjectId, exam = null) {
  return openFormModal({
    title: exam ? 'Edit examination' : 'New examination',
    html: examFields(exam ?? {}),
    validate: validateExam,
    size: 'md',
    submitLabel: exam ? 'Save changes' : 'Add examination',
    onSubmit: async (value) => {
      if (exam) await updateRecord('exams', exam.id, value);
      else await createRecord('exams', { ...value, subjectId });
      toast(exam ? 'Examination updated.' : 'Examination added.', 'success');
    },
  });
}

function openLeetcodeForm(existing, today) {
  return openFormModal({
    title: existing ? `Practice for ${formatDateKey(existing.date)}` : 'Log LeetCode practice',
    html: leetcodeFields(existing ?? {}, today),
    validate: validateLeetcodeDay,
    size: 'md',
    submitLabel: 'Save practice',
    onSubmit: async (value) => {
      const clash = await repos.leetcodeDays.get(value.id);
      if (clash && (!existing || clash.id !== existing.id)) {
        throw new Error(`A practice entry already exists for ${formatDateKey(value.date)}. Edit that entry instead.`);
      }
      const now = nowIso();
      await putRecord('leetcodeDays', {
        id: value.id,
        date: value.date,
        easy: value.easy,
        medium: value.medium,
        hard: value.hard,
        topics: value.topics,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      toast('Practice saved.', 'success');
    },
  });
}

// ---------- Rendering ----------

function renderOverview(snapshot, today) {
  const topics = snapshot.topics;
  const overall = subjectProgress(topics);
  const pendingTopics = topics.filter((topic) => !topic.completed);
  const exams = upcomingExams(snapshot.exams, today, EXAM_WINDOW_DAYS);
  const revisions = revisionDue(topics, today);
  const pending = snapshot.assignments.filter((assignment) => !assignment.done);

  if (snapshot.subjects.length === 0) {
    return `<div class="card empty-state">
      <div class="empty-icon">${icon('graduation', 22)}</div>
      <h2>Set up your academic structure</h2>
      <p>Add a semester, then the subjects you are taking. Topics, assignments and exams will build your analytics from there.</p>
      <button type="button" class="btn btn-primary" data-tab="subjects">Go to subjects</button>
    </div>`;
  }

  const stats = [
    { label: 'Syllabus completion', value: percentText(overall.percent), sub: `${overall.completed} of ${overall.total} topics` },
    { label: 'Pending topics', value: pendingTopics.length, sub: 'Not yet completed' },
    { label: 'Revision due', value: revisions.length, sub: 'Scheduled for today or earlier' },
    { label: 'Upcoming exams', value: exams.length, sub: `Within ${EXAM_WINDOW_DAYS} days` },
    { label: 'Pending assignments', value: pending.length, sub: 'Not yet submitted' },
  ];

  const subjectRows = snapshot.subjects
    .map((subject) => {
      const progress = subjectProgress(snapshot.topics.filter((topic) => topic.subjectId === subject.id));
      const gap = marksGap(subject);
      return `<li class="list-item">
        <div class="list-item-main">
          <a class="list-title" href="#/academics/${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</a>
          <span class="list-sub">${subject.code ? `${escapeHtml(subject.code)} · ` : ''}${progress.completed}/${progress.total} topics${gap !== null ? ` · ${gap > 0 ? `${gap} marks to target` : 'target reached'}` : ''}</span>
        </div>
        <div class="list-item-progress">${barMarkup(progress.percent)}<span class="mono">${percentText(progress.percent)}</span></div>
      </li>`;
    })
    .join('');

  const examRows = exams.length
    ? exams
        .map((exam) => `<li class="list-item">
          <div class="list-item-main">
            <span class="list-title">${escapeHtml(exam.name)}</span>
            <span class="list-sub">${escapeHtml(snapshot.subjects.find((s) => s.id === exam.subjectId)?.name ?? 'No subject')} · ${escapeHtml(relativeDayLabel(exam.date, today))} (${escapeHtml(formatDateKey(exam.date))})</span>
          </div>
        </li>`)
        .join('')
    : '<li class="list-empty">No examinations in the next 60 days.</li>';

  const revisionRows = revisions.length
    ? revisions
        .slice(0, 8)
        .map((topic) => `<li class="list-item">
          <div class="list-item-main">
            <span class="list-title">${escapeHtml(topic.name)}</span>
            <span class="list-sub">${escapeHtml(snapshot.subjects.find((s) => s.id === topic.subjectId)?.name ?? '')} · ${escapeHtml(understandingLabel(topic.understanding))}</span>
          </div>
          <button type="button" class="btn btn-sm" data-action="revise-topic" data-id="${topic.id}">Mark revised</button>
        </li>`)
        .join('')
    : '<li class="list-empty">No revisions are due. Scheduled reviews appear here automatically.</li>';

  const assignmentRows = pending.length
    ? pending
        .slice()
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
        .slice(0, 8)
        .map((assignment) => `<li class="list-item">
          <button type="button" class="check-btn" data-action="toggle-assignment" data-id="${assignment.id}" aria-label="Mark ${escapeHtml(assignment.title)} done"></button>
          <div class="list-item-main">
            <span class="list-title">${escapeHtml(assignment.title)}</span>
            <span class="list-sub">${escapeHtml(snapshot.subjects.find((s) => s.id === assignment.subjectId)?.name ?? '')}${assignment.dueDate ? ` · due ${escapeHtml(relativeDayLabel(assignment.dueDate, today))}` : ''}</span>
          </div>
        </li>`)
        .join('')
    : '<li class="list-empty">No pending assignments.</li>';

  return `<div class="stat-grid stat-grid-5">
      ${stats
        .map((stat) => `<div class="stat-card"><span class="stat-label">${escapeHtml(stat.label)}</span><span class="stat-value mono">${escapeHtml(String(stat.value))}</span><span class="stat-sub">${escapeHtml(stat.sub)}</span></div>`)
        .join('')}
    </div>
    <div class="two-col">
      <section class="card"><h2 class="section-title">Subject progress</h2><ul class="list">${subjectRows}</ul></section>
      <section class="card"><h2 class="section-title">Upcoming examinations</h2><ul class="list">${examRows}</ul></section>
      <section class="card"><h2 class="section-title">Revision requirements</h2><ul class="list">${revisionRows}</ul></section>
      <section class="card"><h2 class="section-title">Pending assignments</h2><ul class="list">${assignmentRows}</ul></section>
    </div>`;
}

function renderSubjects(snapshot, universityName) {
  const semesters = snapshot.semesters.slice().sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  const semesterCards = semesters
    .map((semester) => {
      const subjects = snapshot.subjects.filter((subject) => subject.semesterId === semester.id);
      return `<article class="card semester-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">${escapeHtml(semesterLabel({ ...semester, name: '' }, universityName).replace(/ · $/, '') || 'Semester')}</p>
            <h2>${escapeHtml(semester.name)}</h2>
            <p class="list-sub">${semester.startDate ? escapeHtml(formatDateKey(semester.startDate, { day: 'numeric', month: 'short', year: 'numeric' })) : 'No start date'}${semester.endDate ? ` – ${escapeHtml(formatDateKey(semester.endDate, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}</p>
          </div>
          <div class="row-actions">
            <button type="button" class="icon-btn" data-action="edit-semester" data-id="${semester.id}" aria-label="Edit semester">${icon('edit', 16)}</button>
            <button type="button" class="icon-btn" data-action="delete-semester" data-id="${semester.id}" aria-label="Delete semester">${icon('trash', 16)}</button>
          </div>
        </div>
        ${subjects.length
          ? `<ul class="list">${subjects
              .map((subject) => {
                const progress = subjectProgress(snapshot.topics.filter((topic) => topic.subjectId === subject.id));
                return `<li class="list-item">
                  <div class="list-item-main">
                    <a class="list-title" href="#/academics/${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</a>
                    <span class="list-sub">${subject.code ? `${escapeHtml(subject.code)} · ` : ''}${subject.credits !== null && subject.credits !== undefined ? `${escapeHtml(String(subject.credits))} credits · ` : ''}${progress.total} topics</span>
                  </div>
                  <div class="list-item-progress">${barMarkup(progress.percent)}<span class="mono">${percentText(progress.percent)}</span></div>
                  <div class="row-actions">
                    <button type="button" class="icon-btn" data-action="edit-subject" data-id="${subject.id}" aria-label="Edit ${escapeHtml(subject.name)}">${icon('edit', 16)}</button>
                    <button type="button" class="icon-btn" data-action="delete-subject" data-id="${subject.id}" aria-label="Delete ${escapeHtml(subject.name)}">${icon('trash', 16)}</button>
                  </div>
                </li>`;
              })
              .join('')}</ul>`
          : '<p class="widget-hint">No subjects in this semester yet.</p>'}
      </article>`;
    })
    .join('');

  return `<div class="section-actions">
      <button type="button" class="btn" data-action="new-semester">${icon('plus', 16)} New semester</button>
      <button type="button" class="btn btn-primary" data-action="new-subject">${icon('plus', 16)} New subject</button>
    </div>
    ${semesters.length
      ? semesterCards
      : `<div class="card empty-state"><h2>No semesters yet</h2><p>Create your current semester first. Subjects belong to a semester.</p>
          <button type="button" class="btn btn-primary" data-action="new-semester">${icon('plus', 16)} Create semester</button></div>`}`;
}

function renderLeetcode(snapshot, today) {
  const days = snapshot.leetcodeDays.slice().sort((a, b) => b.date.localeCompare(a.date));
  const totals = days.reduce(
    (sum, day) => ({ easy: sum.easy + day.easy, medium: sum.medium + day.medium, hard: sum.hard + day.hard }),
    { easy: 0, medium: 0, hard: 0 }
  );
  const solved = totals.easy + totals.medium + totals.hard;
  const topicCounts = new Map();
  for (const day of days) {
    for (const topic of day.topics ?? []) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }
  const topicList = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]);

  const history = days.slice(0, 30);
  const historyRows = history.length
    ? history
        .map((day) => `<li class="list-item">
          <div class="list-item-main">
            <span class="list-title">${escapeHtml(formatDateKey(day.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>
            <span class="list-sub">${escapeHtml(day.topics?.join(', ') || 'No topics recorded')}</span>
          </div>
          <span class="mono count-pill">E ${day.easy} · M ${day.medium} · H ${day.hard}</span>
          <div class="row-actions">
            <button type="button" class="icon-btn" data-action="edit-leetcode" data-id="${day.id}" aria-label="Edit practice on ${escapeHtml(day.date)}">${icon('edit', 16)}</button>
            <button type="button" class="icon-btn" data-action="delete-leetcode" data-id="${day.id}" aria-label="Delete practice on ${escapeHtml(day.date)}">${icon('trash', 16)}</button>
          </div>
        </li>`)
        .join('')
    : '<li class="list-empty">No practice logged yet.</li>';

  const streakDays = lastDays(7, today);
  const practisedThisWeek = streakDays.filter((date) => days.some((day) => day.date === date)).length;

  return `<div class="section-actions">
      <button type="button" class="btn btn-primary" data-action="log-leetcode">${icon('plus', 16)} Log practice</button>
    </div>
    <div class="stat-grid stat-grid-5">
      <div class="stat-card"><span class="stat-label">Problems solved</span><span class="stat-value mono">${solved}</span><span class="stat-sub">All logged practice</span></div>
      <div class="stat-card"><span class="stat-label">Easy</span><span class="stat-value mono">${totals.easy}</span><span class="stat-sub">Solved</span></div>
      <div class="stat-card"><span class="stat-label">Medium</span><span class="stat-value mono">${totals.medium}</span><span class="stat-sub">Solved</span></div>
      <div class="stat-card"><span class="stat-label">Hard</span><span class="stat-value mono">${totals.hard}</span><span class="stat-sub">Solved</span></div>
      <div class="stat-card"><span class="stat-label">Active days this week</span><span class="stat-value mono">${practisedThisWeek}<small> / 7</small></span><span class="stat-sub">Days with practice logged</span></div>
    </div>
    <div class="two-col">
      <section class="card"><h2 class="section-title">Topics practised</h2>
        ${topicList.length
          ? `<div class="chip-row">${topicList.map(([topic, count]) => `<span class="tag tag-ghost">${escapeHtml(topic)} · ${count}</span>`).join('')}</div>`
          : '<p class="widget-hint">Topics you record will appear here with how many sessions included them.</p>'}
      </section>
      <section class="card"><h2 class="section-title">Daily practice history</h2><ul class="list">${historyRows}</ul></section>
    </div>
    <p class="widget-hint">Totals are the sum of the entries you log. NEXUS does not connect to LeetCode.</p>`;
}

function renderDetail(snapshot, subjectId, today) {
  const subject = snapshot.subjects.find((item) => item.id === subjectId);
  if (!subject) {
    return `<div class="card empty-state"><h2>Subject not found</h2><p>It may have been deleted.</p><a class="btn" href="#/academics">Back to academics</a></div>`;
  }
  const semester = snapshot.semesters.find((item) => item.id === subject.semesterId);
  const topics = snapshot.topics.filter((topic) => topic.subjectId === subjectId);
  const units = snapshot.units.filter((unit) => unit.subjectId === subjectId).sort((a, b) => a.name.localeCompare(b.name));
  const assignments = snapshot.assignments.filter((item) => item.subjectId === subjectId);
  const exams = snapshot.exams.filter((item) => item.subjectId === subjectId).sort((a, b) => a.date.localeCompare(b.date));
  const progress = subjectProgress(topics);
  const gap = marksGap(subject);
  const nextUp = nextExam(snapshot.exams, subjectId, today);
  const pending = pendingAssignments(assignments, subjectId).length;
  const due = revisionDue(topics, today).length;

  const topicRow = (topic) => `<li class="topic-row${topic.completed ? ' is-done' : ''}">
      <button type="button" class="check-btn${topic.completed ? ' is-done' : ''}" data-action="toggle-topic" data-id="${topic.id}" aria-pressed="${topic.completed}" aria-label="${topic.completed ? 'Mark' : 'Complete'} ${escapeHtml(topic.name)}">${topic.completed ? icon('check', 14) : ''}</button>
      <div class="list-item-main">
        <span class="list-title">${escapeHtml(topic.name)}</span>
        <span class="list-sub">${escapeHtml(understandingLabel(topic.understanding))}${topic.nextRevision ? ` · next revision ${escapeHtml(relativeDayLabel(topic.nextRevision, today).toLowerCase())}` : ''}${topic.notes ? ` · ${escapeHtml(topic.notes.slice(0, 80))}` : ''}</span>
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-sm" data-action="revise-topic" data-id="${topic.id}">Revised</button>
        <button type="button" class="icon-btn" data-action="edit-topic" data-id="${topic.id}" aria-label="Edit ${escapeHtml(topic.name)}">${icon('edit', 16)}</button>
        <button type="button" class="icon-btn" data-action="delete-topic" data-id="${topic.id}" aria-label="Delete ${escapeHtml(topic.name)}">${icon('trash', 16)}</button>
      </div>
    </li>`;

  const unitBlocks = units
    .map((unit) => {
      const unitTopics = topics.filter((topic) => topic.unitId === unit.id);
      const unitProgress = subjectProgress(unitTopics);
      return `<section class="unit-block">
        <div class="unit-head">
          <div><h3>${escapeHtml(unit.name)}</h3><span class="list-sub">${unitProgress.completed}/${unitProgress.total} topics complete</span></div>
          <div class="row-actions">
            <button type="button" class="btn btn-sm" data-action="new-topic" data-subject="${subject.id}" data-unit="${unit.id}">${icon('plus', 14)} Topic</button>
            <button type="button" class="icon-btn" data-action="edit-unit" data-id="${unit.id}" aria-label="Edit ${escapeHtml(unit.name)}">${icon('edit', 16)}</button>
            <button type="button" class="icon-btn" data-action="delete-unit" data-id="${unit.id}" aria-label="Delete ${escapeHtml(unit.name)}">${icon('trash', 16)}</button>
          </div>
        </div>
        <ul class="list">${unitTopics.length ? unitTopics.map(topicRow).join('') : '<li class="list-empty">No topics in this unit yet.</li>'}</ul>
      </section>`;
    })
    .join('');

  const unassigned = topics.filter((topic) => !topic.unitId || !units.some((unit) => unit.id === topic.unitId));
  const unassignedBlock = unassigned.length
    ? `<section class="unit-block"><div class="unit-head"><h3>Unassigned topics</h3></div><ul class="list">${unassigned.map(topicRow).join('')}</ul></section>`
    : '';

  const assignmentRows = assignments.length
    ? assignments
        .slice()
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
        .map((assignment) => `<li class="list-item${assignment.done ? ' is-done' : ''}">
          <button type="button" class="check-btn${assignment.done ? ' is-done' : ''}" data-action="toggle-assignment" data-id="${assignment.id}" aria-pressed="${assignment.done}" aria-label="Toggle ${escapeHtml(assignment.title)}">${assignment.done ? icon('check', 14) : ''}</button>
          <div class="list-item-main">
            <span class="list-title">${escapeHtml(assignment.title)}</span>
            <span class="list-sub">${assignment.dueDate ? `Due ${escapeHtml(relativeDayLabel(assignment.dueDate, today).toLowerCase())} (${escapeHtml(formatDateKey(assignment.dueDate))})` : 'No due date'}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="icon-btn" data-action="edit-assignment" data-id="${assignment.id}" aria-label="Edit ${escapeHtml(assignment.title)}">${icon('edit', 16)}</button>
            <button type="button" class="icon-btn" data-action="delete-assignment" data-id="${assignment.id}" aria-label="Delete ${escapeHtml(assignment.title)}">${icon('trash', 16)}</button>
          </div>
        </li>`)
        .join('')
    : '<li class="list-empty">No assignments for this subject.</li>';

  const examRows = exams.length
    ? exams
        .map((exam) => `<li class="list-item">
          <div class="list-item-main">
            <span class="list-title">${escapeHtml(exam.name)}</span>
            <span class="list-sub">${escapeHtml(relativeDayLabel(exam.date, today))} · ${escapeHtml(formatDateKey(exam.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}${exam.notes ? ` · ${escapeHtml(exam.notes)}` : ''}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="icon-btn" data-action="edit-exam" data-id="${exam.id}" aria-label="Edit ${escapeHtml(exam.name)}">${icon('edit', 16)}</button>
            <button type="button" class="icon-btn" data-action="delete-exam" data-id="${exam.id}" aria-label="Delete ${escapeHtml(exam.name)}">${icon('trash', 16)}</button>
          </div>
        </li>`)
        .join('')
    : '<li class="list-empty">No examinations scheduled.</li>';

  return `<p class="back-link"><a href="#/academics">${icon('chevron', 14)} Back to academics</a></p>
    <section class="page-header">
      <p class="eyebrow mono">${escapeHtml(subject.code || 'Subject')}${semester ? ` · ${escapeHtml(semester.name)}` : ''}</p>
      <div class="header-row">
        <h1>${escapeHtml(subject.name)}</h1>
        <div class="row-actions">
          <button type="button" class="btn" data-action="edit-subject" data-id="${subject.id}">${icon('edit', 16)} Edit subject</button>
          <button type="button" class="btn btn-danger-ghost" data-action="delete-subject" data-id="${subject.id}">${icon('trash', 16)} Delete</button>
        </div>
      </div>
      <p class="lead">${escapeHtml([subject.faculty, subject.credits !== null && subject.credits !== undefined ? `${subject.credits} credits` : ''].filter(Boolean).join(' · ') || 'Add faculty and credits from Edit subject.')}</p>
    </section>

    <div class="stat-grid stat-grid-5">
      <div class="stat-card"><span class="stat-label">Syllabus</span><span class="stat-value mono">${percentText(progress.percent)}</span><span class="stat-sub">${progress.completed} of ${progress.total} topics</span></div>
      <div class="stat-card"><span class="stat-label">Target marks</span><span class="stat-value mono">${subject.targetMarks ?? '–'}</span><span class="stat-sub">Out of 100</span></div>
      <div class="stat-card"><span class="stat-label">Current marks</span><span class="stat-value mono">${subject.currentMarks ?? '–'}</span><span class="stat-sub">${gap === null ? 'Set both values to see the gap' : gap > 0 ? `${gap} to target` : 'Target reached'}</span></div>
      <div class="stat-card"><span class="stat-label">Revision due</span><span class="stat-value mono">${due}</span><span class="stat-sub">Topics to review</span></div>
      <div class="stat-card"><span class="stat-label">Next examination</span><span class="stat-value mono" style="font-size:16px">${nextUp ? escapeHtml(formatDateKey(nextUp.date)) : '–'}</span><span class="stat-sub">${nextUp ? escapeHtml(nextUp.name) : `${pending} pending assignment${pending === 1 ? '' : 's'}`}</span></div>
    </div>

    <div class="section-actions">
      <button type="button" class="btn" data-action="new-unit" data-subject="${subject.id}">${icon('plus', 16)} New unit</button>
      <button type="button" class="btn btn-primary" data-action="new-topic" data-subject="${subject.id}">${icon('plus', 16)} New topic</button>
    </div>
    ${units.length || topics.length ? unitBlocks + unassignedBlock : '<div class="card empty-state"><h2>No units or topics yet</h2><p>Add units to group your syllabus, then topics inside each unit. Topic completion drives your progress.</p></div>'}

    <div class="two-col">
      <section class="card">
        <div class="card-head"><h2 class="section-title">Assignments</h2>
          <button type="button" class="btn btn-sm" data-action="new-assignment" data-subject="${subject.id}">${icon('plus', 14)} Add</button></div>
        <ul class="list">${assignmentRows}</ul>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="section-title">Examinations</h2>
          <button type="button" class="btn btn-sm" data-action="new-exam" data-subject="${subject.id}">${icon('plus', 14)} Add</button></div>
        <ul class="list">${examRows}</ul>
      </section>
    </div>`;
}

// ---------- Page ----------

export function render(container, route, param) {
  const state = { tab: 'overview' };
  let token = 0;
  let timer = null;
  const detailId = param || null;

  container.innerHTML = detailId
    ? `<div data-body></div>`
    : `<section class="page-header">
        <p class="eyebrow">Management</p>
        <h1>Academics</h1>
        <p class="lead">Track syllabus progress, revision, assignments and examinations for each subject.</p>
      </section>
      <div class="view-tabs" role="tablist" aria-label="Academic sections">
        ${TABS.map((tab) => `<button type="button" role="tab" class="tab" data-tab="${tab.value}" aria-selected="${tab.value === state.tab}">${escapeHtml(tab.label)}</button>`).join('')}
      </div>
      <div data-body></div>`;

  const body = container.querySelector('[data-body]');

  async function refresh() {
    const current = ++token;
    try {
      const snapshot = await loadSnapshot();
      if (current !== token) return;
      const today = toDateKey();
      const prefs = resolvePreferences(snapshot.settings.preferences);
      const university = prefs.university;

      container.querySelectorAll('[data-tab]').forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab));
      });

      if (detailId) {
        body.innerHTML = renderDetail(snapshot, detailId, today);
      } else if (state.tab === 'subjects') {
        body.innerHTML = renderSubjects(snapshot, university);
      } else if (state.tab === 'leetcode') {
        body.innerHTML = renderLeetcode(snapshot, today);
      } else {
        body.innerHTML = renderOverview(snapshot, today);
      }
    } catch (error) {
      console.error(error);
      body.innerHTML = `<div class="card empty-state"><h2>Academics could not be loaded</h2><p>${escapeHtml(error.message || '')}</p></div>`;
    }
  }

  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 40);
  }

  async function handle(action, id, dataset) {
    const snapshot = await loadSnapshot();
    const today = toDateKey();
    switch (action) {
      case 'new-semester':
        return openSemesterForm();
      case 'edit-semester': {
        const semester = snapshot.semesters.find((item) => item.id === id);
        return semester ? openSemesterForm(semester) : Promise.reject(new Error('That semester no longer exists.'));
      }
      case 'delete-semester':
        return removeSemester(id);
      case 'new-subject':
        return openSubjectForm(null, snapshot.semesters);
      case 'edit-subject': {
        const subject = snapshot.subjects.find((item) => item.id === id);
        return subject ? openSubjectForm(subject, snapshot.semesters) : Promise.reject(new Error('That subject no longer exists.'));
      }
      case 'delete-subject':
        return removeSubject(id);
      case 'new-unit':
        return openUnitForm(dataset.subject);
      case 'edit-unit': {
        const unit = snapshot.units.find((item) => item.id === id);
        return unit ? openUnitForm(unit.subjectId, unit) : Promise.reject(new Error('That unit no longer exists.'));
      }
      case 'delete-unit':
        return removeUnit(id);
      case 'new-topic':
        return openTopicForm(dataset.subject, snapshot.units.filter((unit) => unit.subjectId === dataset.subject), null, dataset.unit ?? '');
      case 'edit-topic': {
        const topic = snapshot.topics.find((item) => item.id === id);
        if (!topic) throw new Error('That topic no longer exists.');
        return openTopicForm(topic.subjectId, snapshot.units.filter((unit) => unit.subjectId === topic.subjectId), topic);
      }
      case 'delete-topic': {
        const topic = snapshot.topics.find((item) => item.id === id);
        if (!topic) throw new Error('That topic no longer exists.');
        const confirmed = await confirmDialog({ title: 'Delete topic?', message: `Delete ${topic.name}?`, confirmLabel: 'Delete', danger: true });
        if (confirmed) await deleteRecord('topics', id);
        return undefined;
      }
      case 'toggle-topic': {
        const topic = snapshot.topics.find((item) => item.id === id);
        if (!topic) throw new Error('That topic no longer exists.');
        return updateRecord('topics', id, { completed: !topic.completed });
      }
      case 'revise-topic':
        return markRevised(id, today);
      case 'new-assignment':
        return openAssignmentForm(dataset.subject);
      case 'edit-assignment': {
        const assignment = snapshot.assignments.find((item) => item.id === id);
        if (!assignment) throw new Error('That assignment no longer exists.');
        return openAssignmentForm(assignment.subjectId, assignment);
      }
      case 'toggle-assignment': {
        const assignment = snapshot.assignments.find((item) => item.id === id);
        if (!assignment) throw new Error('That assignment no longer exists.');
        return updateRecord('assignments', id, { done: !assignment.done });
      }
      case 'delete-assignment': {
        const assignment = snapshot.assignments.find((item) => item.id === id);
        if (!assignment) throw new Error('That assignment no longer exists.');
        const confirmed = await confirmDialog({ title: 'Delete assignment?', message: `Delete ${assignment.title}?`, confirmLabel: 'Delete', danger: true });
        if (confirmed) await deleteRecord('assignments', id);
        return undefined;
      }
      case 'new-exam':
        return openExamForm(dataset.subject);
      case 'edit-exam': {
        const exam = snapshot.exams.find((item) => item.id === id);
        if (!exam) throw new Error('That examination no longer exists.');
        return openExamForm(exam.subjectId, exam);
      }
      case 'delete-exam': {
        const exam = snapshot.exams.find((item) => item.id === id);
        if (!exam) throw new Error('That examination no longer exists.');
        const confirmed = await confirmDialog({ title: 'Delete examination?', message: `Delete ${exam.name}?`, confirmLabel: 'Delete', danger: true });
        if (confirmed) await deleteRecord('exams', id);
        return undefined;
      }
      case 'log-leetcode': {
        const existing = snapshot.leetcodeDays.find((day) => day.date === today) ?? null;
        return openLeetcodeForm(existing, today);
      }
      case 'edit-leetcode': {
        const existing = snapshot.leetcodeDays.find((day) => day.id === id);
        if (!existing) throw new Error('That practice entry no longer exists.');
        return openLeetcodeForm(existing, today);
      }
      case 'delete-leetcode': {
        const confirmed = await confirmDialog({ title: 'Delete practice entry?', message: 'This removes the practice logged for that day.', confirmLabel: 'Delete', danger: true });
        if (confirmed) await deleteRecord('leetcodeDays', id);
        return undefined;
      }
      default:
        return undefined;
    }
  }

  function onClick(event) {
    const tab = event.target.closest('[data-tab]');
    if (tab && container.contains(tab) && !detailId) {
      state.tab = tab.dataset.tab;
      refresh();
      return;
    }
    const trigger = event.target.closest('[data-action]');
    if (!trigger || !container.contains(trigger)) return;
    safely(() => handle(trigger.dataset.action, trigger.dataset.id, { ...trigger.dataset }));
  }

  container.addEventListener('click', onClick);
  const unsubscribe = on('data', scheduleRefresh);
  refresh();

  return () => {
    unsubscribe();
    clearTimeout(timer);
    container.removeEventListener('click', onClick);
  };
}
