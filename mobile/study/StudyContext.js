import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { STUDY_TASKS } from './tasks.js';

const StudyContext = createContext(null);

function emptyResult(task) {
  return {
    taskId: task.id,
    taskTitle: task.title,
    success: false,
    neededHelp: false,
    timeToAccessSec: null,
    clickCount: 0,
    backtrackCount: 0,
    confidence: null,
    overwhelm: null,
    startedAt: null,
    completedAt: null,
  };
}

export function StudyProvider({ children }) {
  const [phase, setPhase] = useState('welcome');
  const [participantId, setParticipantId] = useState('');
  const [taskIndex, setTaskIndex] = useState(0);
  const [results, setResults] = useState(() => STUDY_TASKS.map(emptyResult));
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [ratingTaskIndex, setRatingTaskIndex] = useState(null);

  const resetAppRef = useRef(null);
  const taskStartedAtRef = useRef(null);
  const clickCountRef = useRef(0);
  const backtrackCountRef = useRef(0);
  const eventsRef = useRef([]);
  const activeTaskRef = useRef(false);
  const finishingRef = useRef(false);
  const taskIndexRef = useRef(0);

  taskIndexRef.current = taskIndex;
  const activeTask = STUDY_TASKS[taskIndex] ?? null;

  const registerResetApp = useCallback((fn) => {
    resetAppRef.current = fn;
  }, []);

  const resetTaskMetrics = useCallback(() => {
    taskStartedAtRef.current = null;
    clickCountRef.current = 0;
    backtrackCountRef.current = 0;
    eventsRef.current = [];
    activeTaskRef.current = false;
    finishingRef.current = false;
  }, []);

  const beginSession = useCallback((id) => {
    const trimmed = id.trim();
    if (!trimmed) return false;
    setParticipantId(trimmed);
    setPhase('tasks');
    setTaskIndex(0);
    taskIndexRef.current = 0;
    setResults(STUDY_TASKS.map(emptyResult));
    resetTaskMetrics();
    setPanelExpanded(true);
    return true;
  }, [resetTaskMetrics]);

  const startTask = useCallback(() => {
    if (!STUDY_TASKS[taskIndexRef.current] || activeTaskRef.current) return;
    activeTaskRef.current = true;
    finishingRef.current = false;
    taskStartedAtRef.current = Date.now();
    clickCountRef.current = 0;
    backtrackCountRef.current = 0;
    eventsRef.current = [];
    resetAppRef.current?.();
    setResults((prev) => {
      const next = [...prev];
      const idx = taskIndexRef.current;
      next[idx] = {
        ...next[idx],
        startedAt: new Date().toISOString(),
      };
      return next;
    });
  }, []);

  const finishTask = useCallback(({ success, neededHelp = false } = {}) => {
    if (finishingRef.current) return;
    if (!activeTaskRef.current) return;
    finishingRef.current = true;
    activeTaskRef.current = false;

    const idx = taskIndexRef.current;
    const elapsedSec = taskStartedAtRef.current
      ? Math.round((Date.now() - taskStartedAtRef.current) / 1000)
      : null;

    setResults((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        success: Boolean(success),
        neededHelp: Boolean(neededHelp),
        timeToAccessSec: elapsedSec,
        clickCount: clickCountRef.current,
        backtrackCount: backtrackCountRef.current,
        completedAt: new Date().toISOString(),
      };
      return next;
    });
    setRatingTaskIndex(idx);
  }, []);

  const trackClick = useCallback((label, { backtrack = false } = {}) => {
    if (!activeTaskRef.current) return;
    clickCountRef.current += 1;
    if (backtrack) backtrackCountRef.current += 1;
    eventsRef.current.push({
      type: 'click',
      label,
      backtrack,
      ts: Date.now(),
    });
  }, []);

  const trackEvent = useCallback((type, data = {}) => {
    if (!activeTaskRef.current || finishingRef.current) return;
    eventsRef.current.push({ type, ...data, ts: Date.now() });

    const task = STUDY_TASKS[taskIndexRef.current];
    if (task?.checkSuccess(eventsRef.current)) {
      finishTask({ success: true });
    }
  }, [finishTask]);

  const submitRatings = useCallback((confidence, overwhelm) => {
    const idx = ratingTaskIndex;
    if (idx == null) return;
    setResults((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        confidence,
        overwhelm,
      };
      return next;
    });
    setRatingTaskIndex(null);

    if (idx >= STUDY_TASKS.length - 1) {
      setPhase('complete');
      setPanelExpanded(true);
    } else {
      const nextIdx = idx + 1;
      taskIndexRef.current = nextIdx;
      setTaskIndex(nextIdx);
      resetTaskMetrics();
      resetAppRef.current?.();
    }
  }, [ratingTaskIndex, resetTaskMetrics]);

  const markNeedHelp = useCallback(() => {
    finishTask({ success: false, neededHelp: true });
  }, [finishTask]);

  const markFinished = useCallback(() => {
    const task = STUDY_TASKS[taskIndexRef.current];
    const success = task?.checkSuccess(eventsRef.current) ?? false;
    finishTask({ success });
  }, [finishTask]);

  const value = useMemo(() => ({
    phase,
    participantId,
    taskIndex,
    activeTask,
    results,
    panelExpanded,
    ratingTaskIndex,
    setPanelExpanded,
    beginSession,
    startTask,
    trackClick,
    trackEvent,
    registerResetApp,
    markNeedHelp,
    markFinished,
    submitRatings,
    taskCount: STUDY_TASKS.length,
  }), [
    phase,
    participantId,
    taskIndex,
    activeTask,
    results,
    panelExpanded,
    ratingTaskIndex,
    beginSession,
    startTask,
    trackClick,
    trackEvent,
    registerResetApp,
    markNeedHelp,
    markFinished,
    submitRatings,
  ]);

  return (
    <StudyContext.Provider value={value}>
      {children}
    </StudyContext.Provider>
  );
}

export function useStudy() {
  return useContext(StudyContext);
}
