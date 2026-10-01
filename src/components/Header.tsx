import React from 'react';
import { Cpu, RotateCcw, Sparkles } from 'lucide-react';
import { DEMO_PRESETS, type DemoPreset } from '../presets';

interface HeaderProps {
  currentPresetId: string;
  onSelectPreset: (preset: DemoPreset) => void;
  cycleCount: number;
  instructionCount: number;
  isRunning: boolean;
  isHalted: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentPresetId,
  onSelectPreset,
  cycleCount,
  instructionCount,
  isRunning,
  isHalted,
}) => {
  return (
    <header className="border-b border-slate-800 bg-[#090d18] px-4 py-3 shadow-md">
      <div className="mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Logo and Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/20">
            <Cpu className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">8051 Microcontroller</h1>
              <span className="rounded bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-400 border border-sky-500/20">
                MCS-51 Core
              </span>
              <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-300 border border-indigo-500/20">
                2-Pass Assembler
              </span>
            </div>
            <p className="text-xs text-slate-400">Headless Cycle-Accurate CPU & Interactive Visual Debugger</p>
          </div>
        </div>

        {/* Middle Stats & Status */}
        <div className="flex items-center gap-4 text-xs font-mono">
          {/* Execution Status Badge */}
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-slate-900 border border-slate-800">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isHalted
                  ? 'bg-rose-500 animate-pulse'
                  : isRunning
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span className="font-semibold text-slate-200 uppercase tracking-wider">
              {isHalted ? 'HALTED (SJMP $)' : isRunning ? 'RUNNING' : 'PAUSED'}
            </span>
          </div>

          {/* Stats Badges */}
          <div className="hidden sm:flex items-center gap-3 rounded-lg bg-slate-900/80 px-3 py-1.5 border border-slate-800 text-slate-300">
            <div>
              <span className="text-slate-500">CYCLES: </span>
              <span className="font-bold text-sky-400">{cycleCount.toLocaleString()}</span>
            </div>
            <span className="text-slate-700">|</span>
            <div>
              <span className="text-slate-500">STEPS: </span>
              <span className="font-bold text-indigo-400">{instructionCount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Demo Preset Dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="preset-select" className="text-xs text-slate-400 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Preset:</span>
          </label>
          <select
            id="preset-select"
            value={currentPresetId}
            onChange={(e) => {
              const selected = DEMO_PRESETS.find((p) => p.id === e.target.value);
              if (selected) onSelectPreset(selected);
            }}
            className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-600 focus:border-sky-500 focus:outline-none transition-colors"
          >
            {DEMO_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
};
