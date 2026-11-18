// Focus session engine. Time is measured from timestamps, not from counting ticks,
// so a background tab or a reload cannot change how much time was recorded.

export function createSession({ type, plannedMs, taskId = null, projectId = null, now }) {
  return {
    type,
    plannedMs,
    taskId,
    projectId,
    startedAt: now,
    pausedMs: 0,
    pausedAt: null,
  };
}

// Focused time: wall-clock span since start, minus all paused intervals.
export function elapsedMs(session, now) {
  const end = session.pausedAt ?? now;
  return Math.max(0, end - session.startedAt - session.pausedMs);
}

export function remainingMs(session, now) {
  return Math.max(0, session.plannedMs - elapsedMs(session, now));
}

export function isFinished(session, now) {
  return remainingMs(session, now) === 0;
}

export function pauseSession(session, now) {
  if (session.pausedAt !== null) return session;
  return { ...session, pausedAt: now };
}

export function resumeSession(session, now) {
  if (session.pausedAt === null) return session;
  return { ...session, pausedMs: session.pausedMs + (now - session.pausedAt), pausedAt: null };
}

export function formatClock(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
