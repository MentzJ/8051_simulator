import React from 'react';
import { Layers, Activity, Binary, Hash } from 'lucide-react';
import { PSW_MASK } from '../types';

interface RegisterState {
  a: number;
  b: number;
  pc: number;
  sp: number;
  dptr: number;
  dph: number;
  dpl: number;
  psw: number;
  bank: number;
  r: number[]; // R0 - R7 for current bank
}

interface RegisterDashboardProps {
  registers: RegisterState;
  prevRegisters?: RegisterState | null;
}

export const RegisterDashboard: React.FC<RegisterDashboardProps> = ({
  registers,
  prevRegisters,
}) => {
  const { a, b, pc, sp, dptr, dph, dpl, psw, bank, r } = registers;

  // PSW flag states
  const cy = (psw & PSW_MASK.CY) !== 0;
  const ac = (psw & PSW_MASK.AC) !== 0;
  const f0 = (psw & PSW_MASK.F0) !== 0;
  const rs1 = (psw & PSW_MASK.RS1) !== 0;
  const rs0 = (psw & PSW_MASK.RS0) !== 0;
  const ov = (psw & PSW_MASK.OV) !== 0;
  const f1 = (psw & PSW_MASK.F1) !== 0;
  const p = (psw & PSW_MASK.P) !== 0;

  // Formatter helpers
  const hex8 = (val: number) => '0x' + (val & 0xff).toString(16).toUpperCase().padStart(2, '0');
  const hex16 = (val: number) => '0x' + (val & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const bin8 = (val: number) => (val & 0xff).toString(2).padStart(8, '0');

  // Check if a value changed since previous step
  const hasChanged = (curr: number, prev?: number) => prev !== undefined && curr !== prev;

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-[#0b101e] shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#0d1322] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-sky-400" />
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
            Register Dashboard
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-slate-900 border border-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-400">
          <Layers className="h-3 w-3 text-indigo-400" />
          <span>Bank {bank}</span>
          <span className="text-slate-600">({(bank * 8).toString(16).toUpperCase().padStart(2, '0')}H)</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Core Registers Grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {/* A (Accumulator) */}
          <div
            className={`rounded-lg border p-2.5 transition-all ${
              hasChanged(a, prevRegisters?.a)
                ? 'border-amber-500/60 bg-amber-500/10 shadow-sm shadow-amber-500/20'
                : 'border-slate-800 bg-slate-900/70'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span className="text-sky-300 font-bold">A (ACC)</span>
              <span className="text-[10px] text-slate-500 font-mono">0xE0</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono">
              <span className="text-base font-bold text-white tracking-wider">{hex8(a)}</span>
              <span className="text-xs text-slate-400 font-mono">#{a}</span>
            </div>
            {/* 8-bit binary visualizer */}
            <div className="mt-1.5 flex justify-between gap-0.5 font-mono text-[9px]">
              {bin8(a)
                .split('')
                .map((bit, idx) => (
                  <span
                    key={idx}
                    className={`w-full text-center rounded py-0.5 ${
                      bit === '1'
                        ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30'
                        : 'bg-slate-950 text-slate-600'
                    }`}
                  >
                    {bit}
                  </span>
                ))}
            </div>
          </div>

          {/* B Register */}
          <div
            className={`rounded-lg border p-2.5 transition-all ${
              hasChanged(b, prevRegisters?.b)
                ? 'border-amber-500/60 bg-amber-500/10 shadow-sm shadow-amber-500/20'
                : 'border-slate-800 bg-slate-900/70'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span className="text-slate-300 font-bold">B</span>
              <span className="text-[10px] text-slate-500 font-mono">0xF0</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono">
              <span className="text-base font-bold text-white tracking-wider">{hex8(b)}</span>
              <span className="text-xs text-slate-400 font-mono">#{b}</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500 font-mono truncate">
              MUL/DIV operand
            </div>
          </div>

          {/* PC (Program Counter) */}
          <div
            className={`rounded-lg border p-2.5 transition-all ${
              hasChanged(pc, prevRegisters?.pc)
                ? 'border-sky-500/60 bg-sky-500/10 shadow-sm shadow-sky-500/20'
                : 'border-slate-800 bg-slate-900/70'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span className="text-amber-400 font-bold">PC</span>
              <span className="text-[10px] text-slate-500 font-mono">16-bit</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono">
              <span className="text-base font-bold text-amber-300 tracking-wider">{hex16(pc)}</span>
              <span className="text-xs text-slate-400 font-mono">#{pc}</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500 font-mono">
              ROM pointer
            </div>
          </div>

          {/* SP (Stack Pointer) */}
          <div
            className={`rounded-lg border p-2.5 transition-all ${
              hasChanged(sp, prevRegisters?.sp)
                ? 'border-amber-500/60 bg-amber-500/10 shadow-sm shadow-amber-500/20'
                : 'border-slate-800 bg-slate-900/70'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span className="text-emerald-400 font-bold">SP</span>
              <span className="text-[10px] text-slate-500 font-mono">0x81</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono">
              <span className="text-base font-bold text-white tracking-wider">{hex8(sp)}</span>
              <span className="text-xs text-slate-400 font-mono">#{sp}</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500 font-mono">
              Reset default: 0x07
            </div>
          </div>

          {/* DPTR (Data Pointer: DPH & DPL) */}
          <div
            className={`col-span-2 sm:col-span-2 rounded-lg border p-2.5 transition-all ${
              hasChanged(dptr, prevRegisters?.dptr)
                ? 'border-amber-500/60 bg-amber-500/10 shadow-sm shadow-amber-500/20'
                : 'border-slate-800 bg-slate-900/70'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span className="text-indigo-400 font-bold">DPTR</span>
              <span className="text-[10px] text-slate-500 font-mono">16-bit (DPH:DPL)</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono">
              <span className="text-base font-bold text-white tracking-wider">{hex16(dptr)}</span>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">
                  DPH: <strong className="text-slate-200">{hex8(dph)}</strong>
                </span>
                <span className="text-slate-400">
                  DPL: <strong className="text-slate-200">{hex8(dpl)}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* PSW Flags Section */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">PSW Flags</span>
            <span className="text-xs font-mono text-slate-400">
              Raw: <strong className="text-slate-200">{hex8(psw)}</strong> ({bin8(psw)})
            </span>
          </div>

          {/* Individual Badges for PSW flags: CY, AC, OV, P */}
          <div className="grid grid-cols-4 gap-2">
            {/* CY Badge */}
            <div
              className={`flex flex-col items-center justify-center rounded-lg border p-2 transition-all ${
                cy
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300 shadow-sm shadow-emerald-500/20 scale-[1.02]'
                  : 'border-slate-800/80 bg-slate-950/60 text-slate-600'
              }`}
            >
              <span className="text-xs font-extrabold tracking-wide">CY</span>
              <span className="text-[10px] font-mono mt-0.5">{cy ? '1 (SET)' : '0'}</span>
              <span className="text-[9px] text-slate-500 truncate mt-0.5">Carry</span>
            </div>

            {/* AC Badge */}
            <div
              className={`flex flex-col items-center justify-center rounded-lg border p-2 transition-all ${
                ac
                  ? 'border-sky-500/60 bg-sky-500/20 text-sky-300 shadow-sm shadow-sky-500/20 scale-[1.02]'
                  : 'border-slate-800/80 bg-slate-950/60 text-slate-600'
              }`}
            >
              <span className="text-xs font-extrabold tracking-wide">AC</span>
              <span className="text-[10px] font-mono mt-0.5">{ac ? '1 (SET)' : '0'}</span>
              <span className="text-[9px] text-slate-500 truncate mt-0.5">Aux Carry</span>
            </div>

            {/* OV Badge */}
            <div
              className={`flex flex-col items-center justify-center rounded-lg border p-2 transition-all ${
                ov
                  ? 'border-rose-500/60 bg-rose-500/20 text-rose-300 shadow-sm shadow-rose-500/20 scale-[1.02]'
                  : 'border-slate-800/80 bg-slate-950/60 text-slate-600'
              }`}
            >
              <span className="text-xs font-extrabold tracking-wide">OV</span>
              <span className="text-[10px] font-mono mt-0.5">{ov ? '1 (SET)' : '0'}</span>
              <span className="text-[9px] text-slate-500 truncate mt-0.5">Overflow</span>
            </div>

            {/* P Badge */}
            <div
              className={`flex flex-col items-center justify-center rounded-lg border p-2 transition-all ${
                p
                  ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300 shadow-sm shadow-indigo-500/20 scale-[1.02]'
                  : 'border-slate-800/80 bg-slate-950/60 text-slate-600'
              }`}
            >
              <span className="text-xs font-extrabold tracking-wide">P</span>
              <span className="text-[10px] font-mono mt-0.5">{p ? '1 (ODD)' : '0 (EVEN)'}</span>
              <span className="text-[9px] text-slate-500 truncate mt-0.5">Parity</span>
            </div>
          </div>

          {/* Secondary Flags Row */}
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] font-mono text-slate-400">
            <span className={f0 ? 'text-amber-300 font-bold' : 'text-slate-600'}>F0: {f0 ? '1' : '0'}</span>
            <span className={rs1 ? 'text-indigo-300 font-bold' : 'text-slate-600'}>RS1: {rs1 ? '1' : '0'}</span>
            <span className={rs0 ? 'text-indigo-300 font-bold' : 'text-slate-600'}>RS0: {rs0 ? '1' : '0'}</span>
            <span className={f1 ? 'text-amber-300 font-bold' : 'text-slate-600'}>F1: {f1 ? '1' : '0'}</span>
          </div>
        </div>

        {/* Working Registers R0 - R7 for current Bank */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">
              Working Registers (R0 – R7)
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Active: <strong className="text-indigo-400">Bank {bank}</strong> (RAM 0x{(bank * 8).toString(16).toUpperCase().padStart(2, '0')})
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {r.map((val, idx) => {
              const regChanged = hasChanged(val, prevRegisters?.r[idx]);
              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-1.5 text-center font-mono transition-all ${
                    regChanged
                      ? 'border-amber-500/70 bg-amber-500/10 shadow-sm shadow-amber-500/20'
                      : 'border-slate-800/80 bg-slate-950/70'
                  }`}
                >
                  <div className="text-[10px] font-bold text-slate-400">R{idx}</div>
                  <div className="text-xs font-bold text-slate-200 mt-0.5">{hex8(val)}</div>
                  <div className="text-[9px] text-slate-500">#{val}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
