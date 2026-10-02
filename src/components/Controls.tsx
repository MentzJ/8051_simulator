import React from 'react';
import { Play, Pause, StepForward, RotateCcw, Zap, Gauge, Hammer } from './Icons';

export type ExecutionSpeed = '1hz' | '10hz' | 'max';

interface ControlsProps {
  isRunning: boolean;
  onStep: () => void;
  onRun: () => void;
  onPause: () => void;
  onReset: () => void;
  onAssemble: () => void;
  speed: ExecutionSpeed;
  onChangeSpeed: (speed: ExecutionSpeed) => void;
  isAssembled: boolean;
  hasErrors: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  onStep,
  onRun,
  onPause,
  onReset,
  onAssemble,
  speed,
  onChangeSpeed,
  isAssembled,
  hasErrors,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0d1322] px-4 py-2.5 shadow-lg">
      {/* Execution Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Step Button */}
        <button
          id="btn-step"
          onClick={onStep}
          disabled={isRunning || hasErrors}
          title="Execute next instruction (Single Step)"
          className="flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-sky-600/20 transition-all active:scale-95"
        >
          <StepForward className="h-4 w-4" />
          <span>Step</span>
        </button>

        {/* Run / Pause Button */}
        {isRunning ? (
          <button
            id="btn-pause"
            onClick={onPause}
            title="Pause execution"
            className="flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-amber-600/20 transition-all active:scale-95 animate-pulse"
          >
            <Pause className="h-4 w-4" />
            <span>Pause</span>
          </button>
        ) : (
          <button
            id="btn-run"
            onClick={onRun}
            disabled={hasErrors}
            title="Run continuous execution"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition-all active:scale-95"
          >
            <Play className="h-4 w-4 fill-white" />
            <span>Run</span>
          </button>
        )}

        {/* Reset Button */}
        <button
          id="btn-reset"
          onClick={onReset}
          title="Reset CPU registers, RAM, and restore PC to 0000H"
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
          <span>Reset</span>
        </button>

        {/* Reassemble / Compile Button */}
        <button
          id="btn-assemble"
          onClick={onAssemble}
          title="Re-assemble source code into ROM"
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
            hasErrors
              ? 'border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
              : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
          }`}
        >
          <Hammer className="h-3.5 w-3.5" />
          <span>Assemble</span>
        </button>
      </div>

      {/* Speed Selector */}
      <div className="flex items-center gap-2 bg-slate-900/90 rounded-lg p-1 border border-slate-800">
        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 px-2">
          <Gauge className="h-3.5 w-3.5 text-sky-400" />
          <span>Speed:</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            id="speed-1hz"
            onClick={() => onChangeSpeed('1hz')}
            className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
              speed === '1hz'
                ? 'bg-sky-500 text-white font-bold shadow-sm shadow-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            1 Hz
          </button>
          <button
            id="speed-10hz"
            onClick={() => onChangeSpeed('10hz')}
            className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
              speed === '10hz'
                ? 'bg-sky-500 text-white font-bold shadow-sm shadow-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            10 Hz
          </button>
          <button
            id="speed-max"
            onClick={() => onChangeSpeed('max')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
              speed === 'max'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Zap className="h-3 w-3 fill-current" />
            <span>Max</span>
          </button>
        </div>
      </div>
    </div>
  );
};
