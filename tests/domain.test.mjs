// Domain tests. These run in Node with no browser, so they cover the rules that must never silently break.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as dates from '../js/domain/dates.js';
import * as recurrence from '../js/domain/recurrence.js';
import * as validation from '../js/domain/validation.js';
import * as tasks from '../js/domain/tasks.js';
import * as analytics from '../js/domain/analytics.js';
import * as alertsModule from '../js/domain/alerts.js';
import * as layout from '../js/domain/layout.js';
import * as timer from '../js/domain/timer.js';
import * as backup from '../js/domain/backup.js';
import * as academics from '../js/domain/academics.js';
import * as projects from '../js/domain/projects.js';
import { resolvePreferences, DEFAULT_PREFERENCES } from '../js/domain/constants.js';

const { addDays, diffDays, isDateKey, isTimeValue, lastDays } = dates;

describe('dates', () => {
  test('rejects impossible calendar dates', () => {
    assert.equal(isDateKey('2026-02-31'), false);
    assert.equal(isDateKey('2026-13-01'), false);
    assert.equal(isDateKey('2026-02-28'), true);
    assert.equal(isDateKey('26-02-28'), false);
  });

  test('adds days across month and year boundaries', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });

  test('counts whole days between keys', () => {
    assert.equal(diffDays('2026-11-18', '2026-11-25'), 7);
    assert.equal(diffDays('2026-11-18', '2026-11-10'), -8);
  });

  test('validates 24-hour times', () => {
    assert.equal(isTimeValue('09:05'), true);
    assert.equal(isTimeValue('24:00'), false);
    assert.equal(isTimeValue('9:05'), false);
  });

  test('returns oldest-first windows ending on the given day', () => {
    assert.deepEqual(lastDays(3, '2026-11-18'), ['2026-11-16', '2026-11-17', '2026-11-18']);
  });
});

describe('recurrence', () => {
  test('daily and weekly steps', () => {
    assert.equal(recurrence.nextOccurrence('2026-11-18', 'daily'), '2026-11-19');
    assert.equal(recurrence.nextOccurrence('2026-11-18', 'weekly'), '2026-11-25');
  });

  test('monthly repeats keep the anchor day where the month allows', () => {
    assert.equal(recurrence.addMonths('2026-01-31', 1, 31), '2026-02-28');
    assert.equal(recurrence.addMonths('2026-02-28', 1, 31), '2026-03-31');
    assert.equal(recurrence.addMonths('2026-11-15', 2), '2027-01-15');
  });

  test('next occurrence after a date skips past instances', () => {
    assert.equal(recurrence.nextOccurrenceAfter('2026-11-01', 'daily', '2026-11-18'), '2026-11-19');
    assert.equal(recurrence.nextOccurrenceAfter('2026-11-16', 'weekly', '2026-11-18'), '2026-11-23');
  });

  test('non-repeating tasks have no next occurrence', () => {
    assert.equal(recurrence.nextOccurrenceAfter('2026-11-16', 'none', '2026-11-18'), null);
  });
});

describe('validation', () => {
  const base = {
    title: 'Read chapter 4',
    category: 'academic',
    priority: 'high',
    dueDate: '2026-11-20',
    dueTime: '',
    recurrence: 'none',
    tags: 'Reading, exam prep, reading',
    description: '',
    projectId: '',
  };

  test('accepts a valid task and normalises tags', () => {
    const result = validation.validateTask(base);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value.tags, ['reading', 'exam prep']);
    assert.equal(result.value.dueTime, null);
  });

  test('requires a title', () => {
    const result = validation.validateTask({ ...base, title: '   ' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.title);
  });

  test('rejects a due time without a due date', () => {
    const result = validation.validateTask({ ...base, dueDate: '', dueTime: '10:00' });
    assert.ok(result.errors.dueTime);
  });

  test('requires a due date for recurring tasks and records the monthly anchor', () => {
    assert.ok(validation.validateTask({ ...base, dueDate: '', recurrence: 'weekly' }).errors.dueDate);
    const monthly = validation.validateTask({ ...base, dueDate: '2026-01-31', recurrence: 'monthly' });
    assert.equal(monthly.value.anchorDay, 31);
  });

  test('rejects impossible dates on tasks', () => {
    assert.ok(validation.validateTask({ ...base, dueDate: '2026-02-31' }).errors.dueDate);
  });

  test('project target date cannot precede its start date', () => {
    const result = validation.validateProject({
      name: 'Compiler',
      category: 'programming',
      status: 'planning',
      priority: 'high',
      startDate: '2026-06-01',
      targetDate: '2026-05-01',
    });
    assert.ok(result.errors.targetDate);
  });

  test('marks must be within 0 to 100', () => {
    const result = validation.validateSubject({ name: 'DSA', semesterId: 'x', targetMarks: '120' });
    assert.ok(result.errors.targetMarks);
  });

  test('journal entries need a title or content and inherit a title from the first line', () => {
    assert.ok(validation.validateJournal({ title: '', content: '', category: 'note' }).errors.content);
    const result = validation.validateJournal({ title: '', content: 'Lesson one\nmore detail', category: 'lesson' });
    assert.equal(result.value.title, 'Lesson one');
  });

  test('preferences reject out-of-range focus targets', () => {
    const result = validation.validatePreferences({
      name: '',
      university: '',
      dailyFocusMinutes: '5',
      lookaheadDays: '3',
      examDays: '14',
      defaultCategory: 'personal',
      defaultPriority: 'medium',
    });
    assert.ok(result.errors.dailyFocusMinutes);
  });
});

describe('tasks', () => {
  const today = '2026-11-18';
  const task = (overrides) => ({
    id: Math.random().toString(36).slice(2),
    title: 'Task',
    status: 'open',
    dueDate: null,
    dueTime: null,
    priority: 'medium',
    recurrence: 'none',
    completions: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  });

  test('overdue when the date has passed, or when today\'s time has passed', () => {
    assert.equal(tasks.isOverdue(task({ dueDate: '2026-11-17' }), today, '09:00'), true);
    assert.equal(tasks.isOverdue(task({ dueDate: today, dueTime: '08:00' }), today, '09:00'), true);
    assert.equal(tasks.isOverdue(task({ dueDate: today, dueTime: '18:00' }), today, '09:00'), false);
    assert.equal(tasks.isOverdue(task({ dueDate: today }), today, '09:00'), false);
    assert.equal(tasks.isOverdue(task({ dueDate: '2026-11-01', status: 'done' }), today, '09:00'), false);
  });

  test('views partition open and completed tasks as expected', () => {
    const list = [
      task({ title: 'past', dueDate: '2026-11-10' }),
      task({ title: 'today', dueDate: today }),
      task({ title: 'later', dueDate: '2026-12-01' }),
      task({ title: 'undated' }),
      task({ title: 'finished', status: 'done', completedAt: '2026-11-15T10:00:00.000Z' }),
    ];
    const titles = (view) => tasks.filterTasks(list, { view }, today, '09:00').map((item) => item.title).sort();
    assert.deepEqual(titles('overdue'), ['past']);
    assert.deepEqual(titles('today'), ['today']);
    assert.deepEqual(titles('upcoming'), ['later']);
    assert.deepEqual(titles('completed'), ['finished']);
    assert.deepEqual(titles('all'), ['later', 'past', 'today', 'undated']);
  });

  test('search matches title, description and tags', () => {
    const list = [task({ title: 'Alpha', tags: ['exam'] }), task({ title: 'Beta', description: 'alpha notes' })];
    const found = tasks.filterTasks(list, { view: 'all', query: 'ALPHA' }, today, '09:00');
    assert.equal(found.length, 2);
    const byTag = tasks.filterTasks(list, { view: 'all', query: 'exam' }, today, '09:00');
    assert.equal(byTag.length, 1);
  });

  test('deadline sort puts undated tasks last', () => {
    const list = [task({ title: 'none' }), task({ title: 'late', dueDate: '2026-12-01' }), task({ title: 'soon', dueDate: '2026-11-20' })];
    assert.deepEqual(tasks.sortTasks(list, 'deadline').map((item) => item.title), ['soon', 'late', 'none']);
  });

  test('one-off completion marks done and records the completion', () => {
    const patch = tasks.completeTask(task({ dueDate: today }), '2026-11-18T09:00:00.000Z', today);
    assert.equal(patch.status, 'done');
    assert.equal(patch.completions.length, 1);
  });

  test('recurring completion advances the due date and never marks the task done', () => {
    const patch = tasks.completeTask(
      task({ dueDate: today, recurrence: 'weekly', anchorDay: 18 }),
      '2026-11-18T09:00:00.000Z',
      today
    );
    assert.equal(patch.status, 'open');
    assert.equal(patch.dueDate, '2026-11-25');
    assert.equal(patch.completions.length, 1);
  });

  test('restoring a completed task reopens it', () => {
    assert.deepEqual(tasks.restoreTask(), { status: 'open', completedAt: null });
  });
});

describe('analytics', () => {
  const today = '2026-11-18';
  const logsFor = (habitId, dates) => dates.map((date) => ({ id: `${habitId}|${date}`, habitId, date }));

  test('streak counts consecutive complete days and does not break before today ends', () => {
    const habits = [{ id: 'read', active: true }, { id: 'run', active: true }];
    const logs = [
      ...logsFor('read', ['2026-11-16', '2026-11-17', '2026-11-18']),
      ...logsFor('run', ['2026-11-16', '2026-11-17']),
    ];
    assert.equal(analytics.habitStreak(habits, logs, today), 2);
  });

  test('streak is zero without habits', () => {
    assert.equal(analytics.habitStreak([], [], today), 0);
  });

  test('missed counts open tasks past their date only', () => {
    const list = [
      { status: 'open', dueDate: '2026-11-10' },
      { status: 'open', dueDate: today, dueTime: '08:00' },
      { status: 'open', dueDate: today, dueTime: '20:00' },
      { status: 'done', dueDate: '2026-11-10' },
    ];
    assert.equal(analytics.missedOn(list, '2026-11-10', today, '09:00'), 1);
    assert.equal(analytics.missedOn(list, today, today, '09:00'), 1);
  });

  test('focus minutes sum the focused seconds of sessions started that day', () => {
    const sessions = [
      { startedAt: new Date(2026, 10, 18, 9, 0).toISOString(), focusedSec: 1500 },
      { startedAt: new Date(2026, 10, 17, 9, 0).toISOString(), focusedSec: 3000 },
    ];
    assert.equal(analytics.focusMinutesOn(sessions, '2026-11-18'), 25);
  });

  test('productivity score is null without data and weighted with data', () => {
    assert.equal(analytics.productivityScore({ taskRate: null, habitRate: null, focusRate: null }), null);
    assert.equal(analytics.productivityScore({ taskRate: 1, habitRate: 0, focusRate: 0 }), 40);
    assert.equal(analytics.productivityScore({ taskRate: 1, habitRate: 1, focusRate: 1 }), 100);
  });

  test('window summary reports completion rate from completions and missed tasks', () => {
    const tasksList = [
      { completions: [new Date(2026, 10, 18, 9).toISOString()], status: 'done' },
      { status: 'open', dueDate: '2026-11-10' },
    ];
    const summary = analytics.windowSummary(['2026-11-18'], {
      tasks: tasksList,
      sessions: [],
      habits: [],
      logs: [],
      focusTarget: 0,
      today,
      nowTime: '09:00',
    });
    assert.equal(summary.completed, 1);
    assert.equal(summary.completionRate, 1);
  });
});

describe('alerts', () => {
  const prefs = resolvePreferences({});
  const base = { tasks: [], objectives: [], exams: [], assignments: [], topics: [], subjects: [], today: '2026-11-18', nowTime: '09:00', prefs };

  test('overdue tasks raise danger alerts and sort first', () => {
    const alerts = alertsModule.buildAlerts({
      ...base,
      tasks: [
        { id: 'a', title: 'Late', status: 'open', dueDate: '2026-11-10' },
        { id: 'b', title: 'Later', status: 'open', dueDate: '2026-11-20' },
      ],
    });
    assert.equal(alerts[0].severity, 'danger');
    assert.equal(alerts[0].title, 'Late');
  });

  test('exams inside the window raise warnings; outside do not', () => {
    const alerts = alertsModule.buildAlerts({
      ...base,
      exams: [
        { id: 'e1', name: 'Midterm', subjectId: 's', date: '2026-11-25' },
        { id: 'e2', name: 'Final', subjectId: 's', date: '2027-03-01' },
      ],
    });
    assert.deepEqual(alerts.map((item) => item.title), ['Midterm']);
  });

  test('disabled notification kinds produce no alerts', () => {
    const quiet = resolvePreferences({ notifications: { overdue: false } });
    const alerts = alertsModule.buildAlerts({
      ...base,
      prefs: quiet,
      tasks: [{ id: 'a', title: 'Late', status: 'open', dueDate: '2026-11-10' }],
    });
    assert.equal(alerts.length, 0);
  });

  test('incomplete objectives are reported only for today', () => {
    const alerts = alertsModule.buildAlerts({
      ...base,
      objectives: [
        { id: 'o1', date: '2026-11-18', done: true, text: 'one' },
        { id: 'o2', date: '2026-11-18', done: false, text: 'two' },
      ],
    });
    assert.equal(alerts.find((item) => item.kind === 'objectives').detail, '1 of 2 for today');
  });
});

describe('layout', () => {
  const known = ['a', 'b', 'c'];

  test('drops unknown and duplicate entries and appends missing widgets', () => {
    const saved = { widgets: [{ id: 'b', visible: false }, { id: 'zzz', visible: true }, { id: 'b', visible: true }] };
    const result = layout.normaliseLayout(saved, known, known);
    assert.deepEqual(result, [
      { id: 'b', visible: false },
      { id: 'a', visible: true },
      { id: 'c', visible: true },
    ]);
  });

  test('missing saved layout yields the default order', () => {
    assert.deepEqual(layout.normaliseLayout(null, known, known).map((e) => e.id), known);
  });

  test('moving a widget swaps it with its neighbour and stops at the edges', () => {
    const start = layout.defaultLayout(known);
    assert.deepEqual(layout.moveWidget(start, 'b', -1).map((e) => e.id), ['b', 'a', 'c']);
    assert.deepEqual(layout.moveWidget(start, 'a', -1).map((e) => e.id), ['a', 'b', 'c']);
  });

  test('visibility toggles without reordering', () => {
    const hidden = layout.setWidgetVisible(layout.defaultLayout(known), 'b', false);
    assert.equal(hidden[1].visible, false);
    assert.deepEqual(hidden.map((e) => e.id), known);
  });
});

describe('focus timer', () => {
  test('elapsed time excludes paused intervals', () => {
    let session = timer.createSession({ type: 'focus', plannedMs: 60000, now: 0 });
    session = timer.pauseSession(session, 20000);
    assert.equal(timer.elapsedMs(session, 50000), 20000);
    session = timer.resumeSession(session, 50000);
    assert.equal(timer.elapsedMs(session, 60000), 30000);
    assert.equal(timer.remainingMs(session, 60000), 30000);
  });

  test('finishes exactly when planned focused time has passed', () => {
    const session = timer.createSession({ type: 'pomodoro', plannedMs: 1500000, now: 0 });
    assert.equal(timer.isFinished(session, 1499999), false);
    assert.equal(timer.isFinished(session, 1500000), true);
  });

  test('pausing twice or resuming when running changes nothing', () => {
    const running = timer.createSession({ type: 'focus', plannedMs: 1000, now: 0 });
    assert.equal(timer.resumeSession(running, 5), running);
    const paused = timer.pauseSession(running, 5);
    assert.equal(timer.pauseSession(paused, 9), paused);
  });

  test('clock formatting rounds up partial seconds', () => {
    assert.equal(timer.formatClock(1500000), '25:00');
    assert.equal(timer.formatClock(500), '00:01');
  });
});

describe('backup validation', () => {
  const storeNames = ['tasks', 'kv'];
  const valid = () => ({
    format: backup.BACKUP_FORMAT,
    version: backup.BACKUP_VERSION,
    exportedAt: '2026-11-18T00:00:00.000Z',
    stores: { tasks: [{ id: 't1', title: 'x' }], kv: [{ key: 'preferences', value: {} }] },
  });

  test('accepts a well-formed backup', () => {
    const result = backup.validateBackup(valid(), storeNames);
    assert.equal(result.ok, true);
    assert.equal(result.totalRecords, 2);
  });

  test('rejects files that are not NEXUS backups', () => {
    const result = backup.validateBackup({ format: 'something-else' }, storeNames);
    assert.equal(result.ok, false);
  });

  test('rejects unsupported versions', () => {
    const payload = { ...valid(), version: 99 };
    assert.equal(backup.validateBackup(payload, storeNames).ok, false);
  });

  test('rejects missing and unknown data sections', () => {
    const missing = valid();
    delete missing.stores.kv;
    assert.equal(backup.validateBackup(missing, storeNames).ok, false);

    const unknown = valid();
    unknown.stores.surprise = [];
    assert.equal(backup.validateBackup(unknown, storeNames).ok, false);
  });

  test('rejects duplicate identifiers and records without ids', () => {
    const duplicated = valid();
    duplicated.stores.tasks.push({ id: 't1' });
    assert.equal(backup.validateBackup(duplicated, storeNames).ok, false);

    const anonymous = valid();
    anonymous.stores.tasks.push({ title: 'no id' });
    assert.equal(backup.validateBackup(anonymous, storeNames).ok, false);
  });

  test('settings records must carry a value', () => {
    const payload = valid();
    payload.stores.kv = [{ key: 'orphan' }];
    assert.equal(backup.validateBackup(payload, storeNames).ok, false);
  });
});

describe('academics', () => {
  test('revision dates follow understanding levels', () => {
    assert.equal(academics.nextRevisionFor('needsRevision', '2026-11-18'), '2026-11-19');
    assert.equal(academics.nextRevisionFor('mastered', '2026-11-18'), '2026-12-09');
    assert.equal(academics.nextRevisionFor('notStarted', '2026-11-18'), null);
  });

  test('subject progress is null until topics exist', () => {
    assert.equal(academics.subjectProgress([]).percent, null);
    assert.equal(academics.subjectProgress([{ completed: true }, { completed: false }]).percent, 50);
  });

  test('mastered topics are never listed as revision due', () => {
    const due = academics.revisionDue(
      [
        { id: 'a', nextRevision: '2026-11-17', understanding: 'learning' },
        { id: 'b', nextRevision: '2026-11-17', understanding: 'mastered' },
      ],
      '2026-11-18'
    );
    assert.deepEqual(due.map((item) => item.id), ['a']);
  });

  test('marks gap needs both values', () => {
    assert.equal(academics.marksGap({ targetMarks: 80, currentMarks: 65 }), 15);
    assert.equal(academics.marksGap({ targetMarks: 80, currentMarks: null }), null);
  });
});

describe('projects', () => {
  test('progress is null with no items and derived from milestones and tasks otherwise', () => {
    assert.equal(projects.projectProgress([], []).percent, null);
    const progress = projects.projectProgress(
      [{ done: true }, { done: false }],
      [{ status: 'done' }, { status: 'open' }]
    );
    assert.equal(progress.percent, 50);
  });

  test('next action is the earliest open milestone, then the first open task', () => {
    const milestones = [
      { id: 'm1', title: 'Later', dueDate: '2026-12-01', done: false },
      { id: 'm2', title: 'Sooner', dueDate: '2026-11-25', done: false },
    ];
    assert.equal(projects.nextActionFor(milestones, []), 'Sooner');
    assert.equal(projects.nextActionFor([], [{ title: 'Write tests', status: 'open' }]), 'Write tests');
    assert.equal(projects.nextActionFor([], []), null);
  });

  test('timeline positions are clamped between start and target', () => {
    const project = { startDate: '2026-11-01', targetDate: '2026-11-11' };
    const timeline = projects.projectTimeline(project, [{ id: 'm', title: 'Mid', dueDate: '2026-11-06', done: false }], '2026-11-20');
    assert.equal(timeline.todayRatio, 1);
    assert.equal(timeline.markers[0].ratio, 0.5);
  });

  test('completion history lists finished items newest first', () => {
    const history = projects.completionHistory(
      [{ title: 'M1', done: true, completedAt: '2026-11-01T00:00:00.000Z' }],
      [{ title: 'T1', status: 'done', completedAt: '2026-11-10T00:00:00.000Z' }]
    );
    assert.deepEqual(history.map((item) => item.title), ['T1', 'M1']);
  });
});

describe('preferences', () => {
  test('falls back to defaults for corrupted values', () => {
    const prefs = resolvePreferences({ dailyFocusMinutes: 'lots', notifications: { overdue: 'yes' } });
    assert.equal(prefs.dailyFocusMinutes, DEFAULT_PREFERENCES.dailyFocusMinutes);
    assert.equal(prefs.notifications.overdue, DEFAULT_PREFERENCES.notifications.overdue);
  });
});

describe('progress snapshots and performance rules', () => {
  test('academic and project progress are null with no data and averaged when present', async () => {
    const { progressSnapshot } = await import('../js/domain/analytics.js');
    const empty = progressSnapshot({}, '2026-11-18');
    assert.equal(empty.academic, null);
    assert.equal(empty.projects, null);

    const snapshot = progressSnapshot(
      {
        topics: [{ completed: true }, { completed: false }, { completed: true }, { completed: true }],
        projects: [
          { id: 'p1', status: 'active' },
          { id: 'p2', status: 'active' },
          { id: 'p3', status: 'archived' },
        ],
        milestones: [{ projectId: 'p1', done: true }, { projectId: 'p1', done: false }, { projectId: 'p2', done: false }],
        tasks: [],
      },
      '2026-11-18'
    );
    assert.equal(snapshot.academic, 75);
    assert.equal(snapshot.activeProjects, 2);
    assert.equal(snapshot.projects, 25);
  });

  test('window summary measures completions and computes the completion rate', async () => {
    const { windowSummary } = await import('../js/domain/analytics.js');
    const day = '2026-11-18';
    const result = windowSummary([day], {
      tasks: [{ completions: [new Date(2026, 10, 18, 9).toISOString()], status: 'done' }],
      sessions: [],
      habits: [],
      logs: [],
      focusTarget: 120,
      today: day,
      nowTime: '10:00',
    });
    assert.equal(result.focusMinutes, 0);
    assert.equal(result.summaries[0].focusRate, 0);
    assert.equal(result.summaries[0].habitRate, null);
  });
});
