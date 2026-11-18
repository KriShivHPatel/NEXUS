// Focus session engine. Holds at most one active session. The session is saved so that a reload or a closed tab
// resumes it. Time is measured from timestamps, so background tabs cannot change the recorded duration.

import { emit } from '../bus.js';
import { repos, createRecord } from '../data.js';
import { createSession, elapsedMs, remainingMs, isFinished, pauseSession, resumeSession } from '../domain/timer.js';
import { toast } from './toast.js';

const KEY = 'activeFocus';
const MIN_RECORDED_SECONDS = 10;
let session = null;
let ticker = null;

export function focusState(now = Date.now()) {
  if (!session) return null;
  return {
    session,
    status: session.pausedAt === null ? 'running' : 'paused',
    remainingMs: remainingMs(session, now),
    elapsedMs: elapsedMs(session, now),
  };
}

function notify() {
  emit('focus', focusState());
}

function startTicker() {
  if (!ticker) ticker = setInterval(tick, 1000);
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

async function persist() {
  if (session) {
    await repos.kv.put({ key: KEY, value: session, updatedAt: new Date().toISOString() });
  } else {
    await repos.kv.remove(KEY);
  }
}

function tick() {
  if (!session) {
    stopTicker();
    return;
  }
  if (session.pausedAt === null && isFinished(session, Date.now())) {
    finalize(true).catch((error) => {
      console.error(error);
      toast('The completed session could not be saved.', 'error');
    });
    return;
  }
  notify();
}

// Ends the current session. Finished sessions are recorded. Very short early finishes are not.
async function finalize(completed) {
  const now = Date.now();
  const current = session;
  if (!current) return;
  session = null;
  stopTicker();

  let focusedMs = elapsedMs(current, now);
  if (completed) focusedMs = Math.min(focusedMs, current.plannedMs);
  const focusedSec = Math.round(focusedMs / 1000);

  await persist();

  if (completed || focusedSec >= MIN_RECORDED_SECONDS) {
    await createRecord('focusSessions', {
      type: current.type,
      startedAt: new Date(current.startedAt).toISOString(),
      endedAt: new Date(now).toISOString(),
      plannedSec: Math.round(current.plannedMs / 1000),
      focusedSec,
      taskId: current.taskId,
      projectId: current.projectId,
      completed,
    });
    toast(completed ? 'Focus session complete. It has been recorded.' : 'Focus session recorded.', 'success');
  } else {
    toast('That session was too short to record.', 'info');
  }
  notify();
}

export async function initFocus() {
  const record = await repos.kv.get(KEY);
  session = record?.value ?? null;
  if (session && isFinished(session, Date.now())) {
    await finalize(true);
  } else if (session) {
    startTicker();
  }
  notify();
}

export async function startFocus({ type, minutes, taskId = null, projectId = null }) {
  if (session) throw new Error('A focus session is already running. Finish or discard it first.');
  session = createSession({ type, plannedMs: minutes * 60000, taskId, projectId, now: Date.now() });
  await persist();
  startTicker();
  notify();
}

export async function pauseFocus() {
  if (!session || session.pausedAt !== null) return;
  session = pauseSession(session, Date.now());
  await persist();
  notify();
}

export async function resumeFocus() {
  if (!session || session.pausedAt === null) return;
  session = resumeSession(session, Date.now());
  await persist();
  notify();
}

export async function finishFocus() {
  if (!session) return;
  await finalize(isFinished(session, Date.now()));
}

export async function discardFocus() {
  if (!session) return;
  session = null;
  stopTicker();
  await persist();
  toast('Session discarded. Nothing was recorded.', 'info');
  notify();
}
