'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { 
  Play, Pause, RotateCcw, Flame, Trophy, 
  BarChart3, RefreshCw, Zap, ShieldCheck 
} from 'lucide-react';
import { 
  getOrCreateUserId, 
  resetUserId, 
  initFlagsmithClient, 
  trackFlagsmithEvent,
  updateUserTraits,
  subscribeVariantChange,
  getFlagSource,
  FocusVariant 
} from '../lib/flagsmith';

function playCompletionChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99]; // C5 -> E5 -> G5
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);

      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.6);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1500);
  } catch {
    // Ignore audio errors in headless or autoplay-restricted browsers
  }
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function FocusPulseApp() {
  const [userId, setUserId] = useState<string>('');
  const [variant, setVariant] = useState<FocusVariant | null>(null);
  const [flagSource, setFlagSource] = useState<'flagsmith' | 'fallback'>('flagsmith');
  const [loading, setLoading] = useState<boolean>(true);

  // Timer State & Admin Guard
  const [showAdminControls, setShowAdminControls] = useState<boolean>(false);
  const [taskName, setTaskName] = useState<string>('Refactor Flagsmith Experimentation Engine');
  const [focusMinutes, setFocusMinutes] = useState<25 | 5>(25);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false); // Default false so public sessions are genuine runs
  const [totalSeconds, setTotalSeconds] = useState<number>(25 * 60);
  const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  // Gamification State (Variant B) — hydrated from localStorage
  const [streakCount, setStreakCount] = useState<number>(0);
  const [xpEarned, setXpEarned] = useState<number>(0);
  const [milestoneNudge, setMilestoneNudge] = useState<string | null>(null);

  // Synchronous Refs for drift-free timer, anti-spam, deduplication, and pagehide abandonment
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const endTimestampRef = useRef<number | null>(null);
  const sessionUuidRef = useRef<string>('');
  const isActiveRef = useRef<boolean>(false);
  const hasStartedRef = useRef<boolean>(false);
  const hasCompletedRef = useRef<boolean>(false);
  const hasAbandonedRef = useRef<boolean>(false);
  const startedSessionsRef = useRef<Set<string>>(new Set());
  const completedSessionsRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string>('');
  const variantRef = useRef<FocusVariant>('minimal');
  const totalSecondsRef = useRef<number>(25 * 60);
  const secondsLeftRef = useRef<number>(25 * 60);
  const isDemoModeRef = useRef<boolean>(false);
  const focusMinutesRef = useRef<25 | 5>(25);
  const streakRef = useRef<number>(0);
  const xpRef = useRef<number>(0);

  // Keep refs synchronized with latest state
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { if (variant) variantRef.current = variant; }, [variant]);
  useEffect(() => { totalSecondsRef.current = totalSeconds; }, [totalSeconds]);
  useEffect(() => { secondsLeftRef.current = secondsLeft; }, [secondsLeft]);
  useEffect(() => { isDemoModeRef.current = isDemoMode; }, [isDemoMode]);
  useEffect(() => { focusMinutesRef.current = focusMinutes; }, [focusMinutes]);
  useEffect(() => { streakRef.current = streakCount; }, [streakCount]);
  useEffect(() => { xpRef.current = xpEarned; }, [xpEarned]);

  // Hydrate persisted Variant B streak & XP from localStorage on mount
  useEffect(() => {
    try {
      const savedStreak = parseInt(localStorage.getItem('fp_streak') || '0', 10);
      const savedXp = parseInt(localStorage.getItem('fp_xp') || '0', 10);
      const validStreak = Number.isFinite(savedStreak) && savedStreak >= 0 ? savedStreak : 0;
      const validXp = Number.isFinite(savedXp) && savedXp >= 0 ? savedXp : 0;
      setStreakCount(validStreak);
      setXpEarned(validXp);
      streakRef.current = validStreak;
      xpRef.current = validXp;
    } catch {}
  }, []);

  // Live countdown in browser tab title while running
  useEffect(() => {
    document.title = isActive ? `${formatTime(secondsLeft)} — FocusPulse` : 'FocusPulse — Focus Timer';
    return () => {
      document.title = 'FocusPulse — Focus Timer';
    };
  }, [isActive, secondsLeft]);

  const sendExposureIfNeeded = useCallback(async (id: string, assignedVariant: FocusVariant, demoMode: boolean, source?: string) => {
    const exposureKey = `fp_exposed_${id}`;
    if (sessionStorage.getItem(exposureKey)) return;
    sessionStorage.setItem(exposureKey, 'true');

    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: `exp_${id}`,
        user_id: id,
        variant: assignedVariant,
        event_name: 'experiment_exposed',
        metadata: {
          is_demo_mode: demoMode,
          flag_source: getFlagSource(),
          source: source || 'initial_load',
          timestamp: new Date().toISOString(),
        },
      }),
    });
  }, []);

  // 1. Initialize persistent identity & Flagsmith variant with Zero-Flicker Loader
  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    const isAdminQuery = params.get('admin') === '1';
    const isEnvEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_CONTROLS === 'true';
    setShowAdminControls(isAdminQuery || isEnvEnabled);

    async function setupExperiment() {
      const id = getOrCreateUserId();
      if (cancelled) return;
      setUserId(id);
      userIdRef.current = id;

      const assignedVariant = await initFlagsmithClient(id);
      if (cancelled) return;

      setVariant(assignedVariant);
      variantRef.current = assignedVariant;
      setFlagSource(getFlagSource());
      setLoading(false);

      await sendExposureIfNeeded(id, assignedVariant, isDemoModeRef.current, 'initial_load');
    }

    setupExperiment();

    const unsubscribe = subscribeVariantChange((liveVariant) => {
      if (cancelled) return;
      if (variantRef.current !== liveVariant) {
        variantRef.current = liveVariant;
        setVariant(liveVariant);
        setFlagSource(getFlagSource());
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sendExposureIfNeeded]);

  // Update duration when toggling focus preset or Demo Mode (only when idle)
  useEffect(() => {
    const duration = isDemoMode ? 60 : focusMinutes * 60;
    setTotalSeconds(duration);
    totalSecondsRef.current = duration;
    if (!hasStarted) {
      setSecondsLeft(duration);
      secondsLeftRef.current = duration;
    }
  }, [isDemoMode, focusMinutes, hasStarted]);

  // 2. Track abandonment automatically if the user closes/navigates away mid-session
  useEffect(() => {
    const handleTabAbandon = () => {
      const sid = sessionUuidRef.current;
      if (
        hasStartedRef.current &&
        !hasCompletedRef.current &&
        !hasAbandonedRef.current &&
        sid
      ) {
        hasAbandonedRef.current = true;
        const currentRemaining = endTimestampRef.current
          ? Math.max(0, Math.ceil((endTimestampRef.current - Date.now()) / 1000))
          : secondsLeftRef.current;
        const elapsed = Math.max(0, totalSecondsRef.current - currentRemaining);

        const payload = JSON.stringify({
          event_id: `aban_${sid}`,
          user_id: userIdRef.current,
          variant: variantRef.current,
          event_name: 'session_abandoned',
          metadata: {
            elapsed_seconds: elapsed,
            is_noise: elapsed < 10,
            is_demo_mode: isDemoModeRef.current,
            session_uuid: sid,
            reason: 'tab_closed',
          },
        });
        navigator.sendBeacon('/api/events', new Blob([payload], { type: 'application/json' }));
      }
    };

    window.addEventListener('pagehide', handleTabAbandon);
    window.addEventListener('beforeunload', handleTabAbandon);
    return () => {
      window.removeEventListener('pagehide', handleTabAbandon);
      window.removeEventListener('beforeunload', handleTabAbandon);
    };
  }, []);

  // 3. Drift-free wall-clock countdown interval (ticks every 250ms against endTimestampRef)
  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      if (!endTimestampRef.current) return;
      const remaining = Math.max(0, Math.ceil((endTimestampRef.current - Date.now()) / 1000));
      secondsLeftRef.current = remaining;
      setSecondsLeft((prev) => (prev !== remaining ? remaining : prev));
    }, 250);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // 4. Gamified milestone nudges and exact completion trigger
  const handleSessionCompleted = useCallback(async () => {
    const currentSessionId = sessionUuidRef.current;
    if (!currentSessionId || completedSessionsRef.current.has(currentSessionId) || hasCompletedRef.current) {
      return;
    }

    hasCompletedRef.current = true;
    isActiveRef.current = false;
    hasStartedRef.current = false;
    endTimestampRef.current = null;
    completedSessionsRef.current.add(currentSessionId);

    setIsActive(false);
    setIsCompleted(true);
    setHasStarted(false);

    playCompletionChime();

    if (variantRef.current === 'gamified') {
      const nextStreak = streakRef.current + 1;
      const nextXp = xpRef.current + 120;
      streakRef.current = nextStreak;
      xpRef.current = nextXp;
      setStreakCount(nextStreak);
      setXpEarned(nextXp);
      try {
        localStorage.setItem('fp_streak', String(nextStreak));
        localStorage.setItem('fp_xp', String(nextXp));
      } catch {}

      try {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}
    }

    const sessionMinutes = isDemoModeRef.current ? 1 : focusMinutesRef.current;

    // 1. Log to local SQLite analytics database
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: `comp_${currentSessionId}`,
        user_id: userIdRef.current,
        variant: variantRef.current,
        event_name: 'session_completed',
        metadata: {
          taskName,
          duration_seconds: totalSecondsRef.current,
          focus_minutes: sessionMinutes,
          is_demo_mode: isDemoModeRef.current,
          session_uuid: currentSessionId,
        },
      }),
    });

    // 2. Dispatch conversion event + duration value to Flagsmith Experimentation
    await trackFlagsmithEvent('session_completed', sessionMinutes, {
      is_demo_mode: isDemoModeRef.current,
      duration_seconds: totalSecondsRef.current,
    });
  }, [taskName]);

  useEffect(() => {
    if (!isActive) return;

    if (variant === 'gamified' && totalSeconds > 0 && secondsLeft > 0) {
      const progress = ((totalSeconds - secondsLeft) / totalSeconds) * 100;
      if (progress >= 90) {
        setMilestoneNudge('⚡ Final stretch! Finish strong to claim +120 XP.');
      } else if (progress >= 50) {
        setMilestoneNudge('🔥 Halfway mark reached! You are in the flow zone.');
      }
    }

    if (secondsLeft === 0) {
      handleSessionCompleted();
    }
  }, [isActive, secondsLeft, totalSeconds, variant, handleSessionCompleted]);

  // Event 1: Session Started (Synchronous double-click & Resume deduplication)
  const startTimer = async () => {
    if (isActiveRef.current) return;
    isActiveRef.current = true;

    const isFreshSession = !hasStartedRef.current;
    if (isFreshSession) {
      sessionUuidRef.current = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      hasStartedRef.current = true;
      hasCompletedRef.current = false;
      hasAbandonedRef.current = false;
    }

    endTimestampRef.current = Date.now() + secondsLeftRef.current * 1000;

    const currentSid = sessionUuidRef.current;
    setIsActive(true);
    setHasStarted(true);
    setIsCompleted(false);
    if (isFreshSession) setMilestoneNudge(null);

    if (isFreshSession && !startedSessionsRef.current.has(currentSid)) {
      startedSessionsRef.current.add(currentSid);
      const preferredMinutes = isDemoModeRef.current ? 1 : focusMinutesRef.current;

      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: `start_${currentSid}`,
          user_id: userIdRef.current,
          variant: variantRef.current,
          event_name: 'session_started',
          metadata: {
            taskName,
            duration_seconds: totalSecondsRef.current,
            is_demo_mode: isDemoModeRef.current,
            session_uuid: currentSid,
          },
        }),
      });

      await updateUserTraits({
        preferred_minutes: preferredMinutes,
      });

      await trackFlagsmithEvent('session_started', preferredMinutes, {
        is_demo_mode: isDemoModeRef.current,
      });
    }
  };

  const pauseTimer = () => {
    if (endTimestampRef.current) {
      const remaining = Math.max(0, Math.ceil((endTimestampRef.current - Date.now()) / 1000));
      secondsLeftRef.current = remaining;
      setSecondsLeft(remaining);
    }
    endTimestampRef.current = null;
    isActiveRef.current = false;
    setIsActive(false);
  };

  // Event 2: Session Abandoned (Includes elapsed_seconds for bot/noise filtering)
  const resetTimer = async () => {
    const sid = sessionUuidRef.current;
    const currentRemaining = endTimestampRef.current
      ? Math.max(0, Math.ceil((endTimestampRef.current - Date.now()) / 1000))
      : secondsLeftRef.current;
    const elapsed = Math.max(0, totalSecondsRef.current - currentRemaining);

    const shouldLogAbandon =
      (isActiveRef.current || (hasStartedRef.current && currentRemaining > 0 && !hasCompletedRef.current)) &&
      !hasAbandonedRef.current &&
      Boolean(sid);

    endTimestampRef.current = null;
    isActiveRef.current = false;
    hasStartedRef.current = false;
    hasCompletedRef.current = false;

    if (shouldLogAbandon) {
      hasAbandonedRef.current = true;
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: `aban_${sid}`,
          user_id: userIdRef.current,
          variant: variantRef.current,
          event_name: 'session_abandoned',
          metadata: {
            elapsed_seconds: elapsed,
            is_noise: elapsed < 10,
            is_demo_mode: isDemoModeRef.current,
            session_uuid: sid,
            reason: 'user_reset',
            forwarded_by_client: true,
          },
        }),
      });

      await trackFlagsmithEvent('session_abandoned', elapsed, {
        is_demo_mode: isDemoModeRef.current,
        reason: 'user_reset',
      });
    }

    setIsActive(false);
    setHasStarted(false);
    setIsCompleted(false);
    setMilestoneNudge(null);
    setSecondsLeft(totalSecondsRef.current);
    secondsLeftRef.current = totalSecondsRef.current;
    sessionUuidRef.current = '';
  };

  const handleResetIdentity = async () => {
    await resetTimer();
    const newId = resetUserId();
    setUserId(newId);
    userIdRef.current = newId;
    setLoading(true);

    const newVariant = await initFlagsmithClient(newId);
    setVariant(newVariant);
    variantRef.current = newVariant;
    setFlagSource(getFlagSource());
    setLoading(false);

    await sendExposureIfNeeded(newId, newVariant, isDemoModeRef.current, 'identity_reset');
  };

  const progressPct = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0;

  // =========================================================================
  // ZERO-FLICKER SKELETON LOADER
  // =========================================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-400">
        <div className="max-w-md w-full bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 flex flex-col items-center space-y-6 animate-pulse">
          <div className="w-12 h-12 bg-slate-800 rounded-2xl"></div>
          <div className="h-4 w-32 bg-slate-800 rounded-full"></div>
          <div className="h-20 w-48 bg-slate-800/80 rounded-2xl"></div>
          <div className="h-10 w-40 bg-slate-800 rounded-xl"></div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 pt-2">
            <ShieldCheck className="w-4 h-4 text-brand-400 animate-spin" />
            <span>Resolving Flagsmith Multivariate Flag...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 md:p-8">
      {/* HEADER */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-brand-500/20">
            FP
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-2">
              FocusPulse
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">A/B Studio</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Genuine Public Focus Duration Presets (is_demo_mode: false) */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => {
                if (!hasStarted) {
                  setIsDemoMode(false);
                  setFocusMinutes(25);
                }
              }}
              disabled={hasStarted}
              className={`px-2 py-1 rounded-md transition ${
                !isDemoMode && focusMinutes === 25
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              25m
            </button>
            <button
              onClick={() => {
                if (!hasStarted) {
                  setIsDemoMode(false);
                  setFocusMinutes(5);
                }
              }}
              disabled={hasStarted}
              className={`px-2 py-1 rounded-md transition ${
                !isDemoMode && focusMinutes === 5
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              5m
            </button>
          </div>

          {/* Admin-only Demo (1m) Toggle */}
          {showAdminControls && (
            <button
              onClick={() => { if (!hasStarted) setIsDemoMode(!isDemoMode); }}
              disabled={hasStarted}
              className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition flex items-center gap-1.5 ${
                isDemoMode 
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Demo (1m)</span>
            </button>
          )}

          <Link
            href={showAdminControls ? '/results?admin=1' : '/results'}
            className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5"
          >
            <BarChart3 className="w-3.5 h-3.5 text-brand-400" />
            <span>Live Results</span>
          </Link>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-2xl w-full mx-auto my-auto py-8">
        
        {/* ============================================================== */}
        {/* VARIANT A: MINIMALIST DISTRACTION-FREE TIMER */}
        {/* ============================================================== */}
        {variant === 'minimal' && (
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono mb-8">
              <span>Mode: Minimalist Focus (Variant A)</span>
            </div>

            {/* Task Name Input */}
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              disabled={hasStarted}
              placeholder="What are you focusing on?"
              className="w-full max-w-md bg-transparent border-b border-slate-800 focus:border-slate-400 text-center text-lg font-medium text-slate-200 focus:outline-none pb-2 mb-10 transition"
            />

            {/* Big Monochrome Countdown */}
            <div className="text-7xl sm:text-8xl font-mono font-light text-slate-100 tracking-tighter mb-10 select-none">
              {formatTime(secondsLeft)}
            </div>

            {/* Simple Controls */}
            <div className="flex items-center gap-3">
              {!isActive ? (
                <button
                  onClick={startTimer}
                  className="bg-slate-100 hover:bg-white text-slate-950 px-8 py-3 rounded-xl font-semibold text-sm transition shadow-sm flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{hasStarted ? 'Resume' : 'Start Focus'}</span>
                </button>
              ) : (
                <button
                  onClick={pauseTimer}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-3 rounded-xl font-semibold text-sm transition border border-slate-700 flex items-center gap-2"
                >
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause</span>
                </button>
              )}

              {hasStarted && (
                <button
                  onClick={resetTimer}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white p-3 rounded-xl transition border border-slate-800"
                  title="Abandon Session"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Minimal Completion Notice */}
            {isCompleted && (
              <div className="mt-8 bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 max-w-sm animate-in fade-in">
                <p className="font-semibold text-white mb-1">Session Complete</p>
                <p className="text-slate-400">Great job. Conversion logged to Flagsmith Experimentation.</p>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* VARIANT B: GAMIFIED STREAK & INSTANT REWARD TIMER */}
        {/* ============================================================== */}
        {variant === 'gamified' && (
          <div className="flex flex-col items-center text-center">
            
            {/* Gamified Top Badges: Persisted Streak & XP */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold shadow-sm">
                <Flame className="w-3.5 h-3.5 fill-amber-500" />
                <span>{streakCount} {streakCount === 1 ? 'Session' : 'Sessions'} Streak</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold shadow-sm">
                <Trophy className="w-3.5 h-3.5" />
                <span>{xpEarned} XP</span>
              </div>
            </div>

            {/* Task Name Box */}
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              disabled={hasStarted}
              placeholder="What mission are you tackling?"
              className="w-full max-w-md bg-slate-900/80 border border-slate-800 focus:border-brand-500 rounded-xl px-4 py-2 text-center text-sm font-semibold text-slate-200 focus:outline-none mb-8 transition shadow-inner"
            />

            {/* Circular Progress Ring with Countdown */}
            <div className="relative w-64 h-64 flex items-center justify-center mb-8">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-slate-800"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-brand-500 transition-all duration-300 ease-linear"
                  strokeWidth="6"
                  strokeDasharray="264"
                  strokeDashoffset={264 - (264 * progressPct) / 100}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>

              <div className="absolute flex flex-col items-center">
                <span className="text-5xl font-mono font-bold text-white tracking-tight">
                  {formatTime(secondsLeft)}
                </span>
                <span className="text-[11px] font-semibold text-brand-400 mt-1 uppercase tracking-wider">
                  {isActive ? 'Deep Flow' : isCompleted ? 'Mission Complete' : 'Ready'}
                </span>
              </div>
            </div>

            {/* Motivational Milestone Nudges */}
            {milestoneNudge && !isCompleted && (
              <div className="mb-6 px-4 py-2 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-300 text-xs font-medium animate-bounce">
                {milestoneNudge}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3">
              {!isActive ? (
                <button
                  onClick={startTimer}
                  className="bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white px-8 py-3 rounded-xl font-bold text-sm transition shadow-lg shadow-brand-500/25 flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{hasStarted ? 'Resume Session' : 'Start Focus (+120 XP)'}</span>
                </button>
              ) : (
                <button
                  onClick={pauseTimer}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-3 rounded-xl font-semibold text-sm transition border border-slate-700 flex items-center gap-2"
                >
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause</span>
                </button>
              )}

              {hasStarted && (
                <button
                  onClick={resetTimer}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white p-3 rounded-xl transition border border-slate-800"
                  title="Abandon Session"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Celebratory Summary Card (Completion Reward) */}
            {isCompleted && (
              <div className="mt-8 bg-slate-900/90 border border-brand-500/40 rounded-2xl p-5 text-center max-w-sm shadow-xl shadow-brand-500/10 animate-in zoom-in-95 duration-200">
                <div className="w-12 h-12 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full flex items-center justify-center text-xl mx-auto mb-2">
                  🏆
                </div>
                <h3 className="font-bold text-white text-base">Focus Mission Accomplished!</h3>
                <p className="text-slate-400 text-xs mt-1 mb-4">You just crushed your deep work session.</p>
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold mb-4">
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">XP GAINED</span>
                    <span className="text-indigo-400">+120 XP ({xpEarned} total)</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">CURRENT STREAK</span>
                    <span className="text-amber-400">{streakCount} {streakCount === 1 ? 'Session' : 'Sessions'} 🔥</span>
                  </div>
                </div>
                <button
                  onClick={resetTimer}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl text-xs font-semibold transition"
                >
                  Start Next Session
                </button>
              </div>
            )}

          </div>
        )}

      </main>

      {/* FOOTER: PERSISTENT EXPERIMENT BADGE */}
      <footer className="max-w-4xl w-full mx-auto border-t border-slate-800/80 pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 font-mono">
        <div className="flex flex-wrap items-center gap-3">
          <span>Session: <strong className="text-slate-300 font-semibold">{userId}</strong></span>
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1.5">
            Variant:
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              variant === 'gamified'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
            }`}>
              {variant?.toUpperCase()}
            </span>
          </span>
          <span className="text-slate-700">|</span>
          <span className={`text-[11px] ${flagSource === 'flagsmith' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {flagSource === 'flagsmith' ? 'Flagsmith Live' : 'Fallback Default'}
          </span>
        </div>

        {showAdminControls && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetIdentity}
              className="text-slate-400 hover:text-white underline hover:no-underline flex items-center gap-1 text-[11px]"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Identity / Switch Variant</span>
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
