'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, RefreshCw, TrendingUp, Zap, Download, Filter, FlaskConical 
} from 'lucide-react';

interface VariantStats {
  exposed_users: number;
  sessions_started: number;
  sessions_abandoned: number;
  sessions_completed: number;
  completion_rate: number;
}

interface EventItem {
  event_id: string;
  user_id: string;
  variant: string;
  event_name: string;
  timestamp: string;
  metadata: string;
}

function parseMeta(raw: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default function ResultsPage() {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [filterNoise, setFilterNoise] = useState<boolean>(true);
  const [includeDemo, setIncludeDemo] = useState<boolean>(true);
  const [excludedNoiseCount, setExcludedNoiseCount] = useState<number>(0);
  const [stats, setStats] = useState<{
    minimal: VariantStats;
    gamified: VariantStats;
  }>({
    minimal: { exposed_users: 0, sessions_started: 0, sessions_abandoned: 0, sessions_completed: 0, completion_rate: 0 },
    gamified: { exposed_users: 0, sessions_started: 0, sessions_abandoned: 0, sessions_completed: 0, completion_rate: 0 }
  });
  const [lift, setLift] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<EventItem[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/stats?filterNoise=${filterNoise}&includeDemo=${includeDemo}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.summary);
        setLift(data.lift);
        setRecentEvents(data.recentEvents || []);
        setExcludedNoiseCount(data.excludedNoiseCount || 0);
      }
    } catch (e) {
      console.error('Error fetching stats:', e);
    } finally {
      setRefreshing(false);
    }
  }, [filterNoise, includeDemo]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulate', count: 20 })
      });
      await fetchStats();
    } catch (e) {
      console.error(e);
    } finally {
      setSimulating(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all tracked events?')) return;
    try {
      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      await fetchStats();
    } catch (e) {
      console.error(e);
    }
  };

  const totalExposed = stats.minimal.exposed_users + stats.gamified.exposed_users;
  const totalCompleted = stats.minimal.sessions_completed + stats.gamified.sessions_completed;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col">
      <div className="max-w-6xl w-full mx-auto space-y-8 flex-1">
        
        {/* HEADER */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-slate-400 hover:text-white transition flex items-center gap-1 text-xs font-mono"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Focus Timer</span>
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <span>FocusPulse Live Results</span>
              <span className="text-xs font-mono font-normal bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Live SQLite Telemetry</span>
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Track 01 Head-to-Head: Minimalist Monochrome vs. Gamified Streak & Instant Reward UI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Noise Filter Toggle */}
            <button
              onClick={() => setFilterNoise(!filterNoise)}
              className={`text-xs px-3 py-2 rounded-xl border transition flex items-center gap-1.5 font-medium ${
                filterNoise
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
              title="Excludes sessions abandoned in under 10 seconds to eliminate click noise and bots"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{filterNoise ? `Noise Filter ON (${excludedNoiseCount})` : 'Noise Filter OFF'}</span>
            </button>

            {/* Demo Mode Filter Toggle */}
            <button
              onClick={() => setIncludeDemo(!includeDemo)}
              className={`text-xs px-3 py-2 rounded-xl border transition flex items-center gap-1.5 font-medium ${
                !includeDemo
                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                  : 'bg-slate-900 text-slate-300 border-slate-700'
              }`}
              title="Toggle whether 60s Demo Mode test sessions are included in aggregates"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>{includeDemo ? 'All Sessions' : 'Production Only (25m)'}</span>
            </button>

            {/* CSV Export Button */}
            <a
              href="/api/stats?format=csv"
              download="focuspulse_events_export.csv"
              className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-brand-400" />
              <span>Export CSV</span>
            </a>

            {/* JSON Export Button */}
            <a
              href="/api/stats?format=json"
              download="focuspulse_events_export.json"
              className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>JSON</span>
            </a>

            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="bg-brand-600 hover:bg-brand-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-md shadow-brand-500/20"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{simulating ? 'Simulating...' : 'Simulate 20 Users'}</span>
            </button>

            <button
              onClick={fetchStats}
              disabled={refreshing}
              className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 p-2 rounded-xl transition"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleReset}
              className="text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-3 py-2 rounded-xl transition"
            >
              Reset Data
            </button>
          </div>
        </header>

        {/* TOP LEVEL SUMMARY BANNER */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 text-center">
            <div className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Total Unique Users</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">{totalExposed}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Assigned via Flagsmith</div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 text-center">
            <div className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Sessions Completed</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{totalCompleted}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Primary Conversion Metric</div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 text-center">
            <div className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Relative Lift</div>
            <div className={`text-2xl font-bold font-mono mt-1 ${lift >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {lift >= 0 ? `+${lift}%` : `${lift}%`}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Gamified vs Minimal</div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 text-center">
            <div className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Hypothesis Outcome</div>
            <div className="text-sm font-bold text-amber-400 mt-2 flex items-center justify-center gap-1">
              <TrendingUp className="w-4 h-4" />
              <span>{lift > 10 ? 'Gamified Winning' : 'Tracking Data'}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">High Engagement</div>
          </div>
        </div>

        {/* SIDE-BY-SIDE VARIANT COMPARISON */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* VARIANT A: MINIMAL */}
          <div className="bg-slate-900/80 border border-indigo-500/20 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  Variant A: Control (50% Split)
                </span>
                <h2 className="text-xl font-bold text-white mt-1">Minimalist Timer</h2>
                <p className="text-xs text-slate-400">Zero distractions, clean monochrome countdown.</p>
              </div>
            </div>

            <div className="space-y-4 my-6">
              <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800">
                <span className="text-slate-400">Unique Users Exposed:</span>
                <span className="font-mono font-semibold text-slate-200">{stats.minimal.exposed_users}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800">
                <span className="text-slate-400">Sessions Started:</span>
                <span className="font-mono font-semibold text-slate-200">{stats.minimal.sessions_started}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800">
                <span className="text-slate-400">Sessions Abandoned:</span>
                <span className="font-mono font-semibold text-rose-400">{stats.minimal.sessions_abandoned}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800">
                <span className="text-slate-400">Sessions Completed:</span>
                <span className="font-mono font-semibold text-emerald-400">{stats.minimal.sessions_completed}</span>
              </div>
            </div>

            {/* Big Conversion Metric Rate */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
              <div className="text-xs text-slate-400 uppercase font-mono">Completion Rate</div>
              <div className="text-3xl font-extrabold font-mono text-indigo-400 mt-1">
                {stats.minimal.completion_rate}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {stats.minimal.sessions_completed} of {stats.minimal.sessions_started} finished
              </div>
            </div>
          </div>

          {/* VARIANT B: GAMIFIED */}
          <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 relative overflow-hidden shadow-xl shadow-amber-500/5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Variant B: Challenger (50% Split)
                </span>
                <h2 className="text-xl font-bold text-white mt-1">Gamified & Streak UI</h2>
                <p className="text-xs text-slate-400">XP points, streak tracker, progress ring, milestone nudges.</p>
              </div>
            </div>

            <div className="space-y-4 my-6">
              <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800">
                <span className="text-slate-400">Unique Users Exposed:</span>
                <span className="font-mono font-semibold text-slate-200">{stats.gamified.exposed_users}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800">
                <span className="text-slate-400">Sessions Started:</span>
                <span className="font-mono font-semibold text-slate-200">{stats.gamified.sessions_started}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800">
                <span className="text-slate-400">Sessions Abandoned:</span>
                <span className="font-mono font-semibold text-rose-400">{stats.gamified.sessions_abandoned}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800">
                <span className="text-slate-400">Sessions Completed:</span>
                <span className="font-mono font-semibold text-emerald-400">{stats.gamified.sessions_completed}</span>
              </div>
            </div>

            {/* Big Conversion Metric Rate */}
            <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/20 text-center">
              <div className="text-xs text-slate-400 uppercase font-mono">Completion Rate</div>
              <div className="text-3xl font-extrabold font-mono text-amber-400 mt-1 flex items-center justify-center gap-2">
                <span>{stats.gamified.completion_rate}%</span>
                {lift > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    +{lift}% lift
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {stats.gamified.sessions_completed} of {stats.gamified.sessions_started} finished
              </div>
            </div>
          </div>

        </div>

        {/* RECENT REAL-TIME EVENTS FEED */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Real-Time Events Stream</span>
                <span className="text-[11px] font-mono text-slate-400">(Latest 15 interactions)</span>
              </h3>
              <p className="text-xs text-slate-400">Each event is permanently captured in the SQLite datastore.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Identity</th>
                  <th className="py-2.5 px-3">Variant</th>
                  <th className="py-2.5 px-3">Event Name</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No interactions recorded yet. Start a focus session or click &quot;Simulate 20 Users&quot;.
                    </td>
                  </tr>
                ) : (
                  recentEvents.map((evt) => {
                    const meta = parseMeta(evt.metadata);
                    return (
                      <tr key={evt.event_id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3 text-slate-400">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-semibold">
                          {evt.user_id.length > 18 ? evt.user_id.substring(0, 16) + '...' : evt.user_id}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            evt.variant === 'gamified'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                          }`}>
                            {evt.variant.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`font-semibold ${
                            evt.event_name === 'session_completed'
                              ? 'text-emerald-400'
                              : evt.event_name === 'session_started'
                              ? 'text-sky-400'
                              : evt.event_name === 'session_abandoned'
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}>
                            {evt.event_name}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-500">
                          {meta.is_demo_mode ? 'Demo 60s' : meta.duration_seconds ? `${meta.duration_seconds}s` : ''}
                          {typeof meta.elapsed_seconds === 'number' ? ` ${meta.elapsed_seconds}s elapsed` : ''}
                          {meta.is_noise ? ' (noise <10s)' : ''}
                          {meta.reason ? ` (${meta.reason})` : ''}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
