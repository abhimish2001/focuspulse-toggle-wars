'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { 
  Play, Pause, RotateCcw, Flame, Trophy, Award, 
  BarChart3, RefreshCw, Zap, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { getOrCreateUserId, resetUserId, initFlagsmithClient, trackFlagsmithConversion, FocusVariant } from '../lib/flagsmith';

export default function FocusPulseApp() {
  const [userId, setUserId] = useState<string>('');
  const [variant, setVariant] = useState<FocusVariant | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Timer State
  const [taskName, setTaskName] = useState<string>('Refactor Flagsmith Experimentation Engine');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true); // 60s for demo, 25m for real
  const [totalSeconds, setTotalSeconds] = useState<number>(60);
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  // Gamification State (Variant B)
  const [streakCount, setStreakCount] = useState<number>(4);
  const [xpEarned, setXpEarned] = useState<number>(360);
  const [milestoneNudge, setMilestoneNudge] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initialize persistent identity & Flagsmith variant
  useEffect(() => {
    async function setupExperiment() {
      const id = getOrCreateUserId();
      setUserId(id);

      const assignedVariant = await initFlagsmithClient(id);
      setVariant(assignedVariant);
      setLoading(false);

      // Log exposure event to local SQLite and Flagsmith
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: id,
          variant: assignedVariant,
          event_name: 'experiment_exposed',
          metadata: { timestamp: new Date().toISOString() }
        })
      });
    }

    setupExperiment();
  }, []);

  // Set timer duration when toggling Demo Mode
  useEffect(() => {
    const duration = isDemoMode ? 60 : 25 * 60;
    setTotalSeconds(duration);
    if (!hasStarted) {
      setSecondsLeft(duration);
    }
  }, [isDemoMode, hasStarted]);

  // Timer countdown loop
  useEffect(() => {
    if (isActive && secondsLeft > 0) {
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          const next = prev - 1;

          // Gamified milestone nudges (Variant B)
          if (variant === 'gamified') {
            const progress = ((totalSeconds - next) / totalSeconds) * 100;
            if (progress >= 50 && progress < 55 && !milestoneNudge) {
              setMilestoneNudge('🔥 Halfway mark reached! You are in the flow zone.');
            } else if (progress >= 90 && progress < 95) {
              setMilestoneNudge('⚡ Final stretch! Finish strong to claim +100 XP.');
            }
          }

          if (next <= 0) {
            handleSessionCompleted();
            return 0;
          }
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, secondsLeft, totalSeconds, variant, milestoneNudge]);

  // Event 1: Session Started
  const startTimer = async () => {
    setIsActive(true);
    setHasStarted(true);
    setIsCompleted(false);
    setMilestoneNudge(null);

    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        variant,
        event_name: 'session_started',
        metadata: { taskName, duration_seconds: totalSeconds }
      })
    });
  };

  const pauseTimer = () => {
    setIsActive(false);
  };

  // Event 2: Session Abandoned (Reset mid-session)
  const resetTimer = async () => {
    if (isActive || (hasStarted && secondsLeft > 0 && !isCompleted)) {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          variant,
          event_name: 'session_abandoned',
          metadata: { elapsed_seconds: totalSeconds - secondsLeft }
        })
      });
    }

    setIsActive(false);
    setHasStarted(false);
    setIsCompleted(false);
    setMilestoneNudge(null);
    setSecondsLeft(totalSeconds);
  };

  // Event 3: Session Completed (Primary Conversion Metric)
  const handleSessionCompleted = async () => {
    setIsActive(false);
    setIsCompleted(true);
    setHasStarted(false);

    if (variant === 'gamified') {
      setStreakCount((prev) => prev + 1);
      setXpEarned((prev) => prev + 120);
      try {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {}
    }

    // 1. Log to local SQLite analytics database
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        variant,
        event_name: 'session_completed',
        metadata: { taskName, duration_seconds: totalSeconds }
      })
    });

    // 2. Dispatch conversion event to Flagsmith Experimentation
    await trackFlagsmithConversion('completed_onboarding');
  };

  const handleResetIdentity = async () => {
    const newId = resetUserId();
    setUserId(newId);
    setLoading(true);
    const newVariant = await initFlagsmithClient(newId);
    setVariant(newVariant);
    setLoading(false);
    resetTimer();

    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: newId,
        variant: newVariant,
        event_name: 'experiment_exposed',
        metadata: { source: 'identity_reset' }
      })
    });
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPct = ((totalSeconds - secondsLeft) / totalSeconds) * 100;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-mono">Evaluating Flagsmith Experiment Flag...</p>
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

        <div className="flex items-center gap-3">
          {/* Quick Demo Mode Toggle */}
          <button
            onClick={() => { if (!hasStarted) setIsDemoMode(!isDemoMode); }}
            disabled={hasStarted}
            className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition flex items-center gap-1.5 ${
              isDemoMode 
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>{isDemoMode ? 'Demo Mode (60s)' : 'Standard (25m)'}</span>
          </button>

          <a
            href="/results"
            className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5"
          >
            <BarChart3 className="w-3.5 h-3.5 text-brand-400" />
            <span>Live Results</span>
          </a>
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
            
            {/* Gamified Top Badges: Streak & XP */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold shadow-sm">
                <Flame className="w-3.5 h-3.5 fill-amber-500" />
                <span>{streakCount} Day Streak</span>
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
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-slate-800"
                  strokeWidth="6"
                  fill="transparent"
                />
                {/* Active Gradient Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-brand-500 transition-all duration-1000 ease-linear"
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
                    <span className="text-indigo-400">+120 XP</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">CURRENT STREAK</span>
                    <span className="text-amber-400">{streakCount} Days 🔥</span>
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
        <div className="flex items-center gap-3">
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
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetIdentity}
            className="text-slate-400 hover:text-white underline hover:no-underline flex items-center gap-1 text-[11px]"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset Identity / Switch Variant</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
