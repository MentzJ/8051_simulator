import React, { useState, useRef, useEffect } from 'react';
import { SCON_MASK } from '../types';

const LightbulbIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
    <path d="M9 18h6" />
    <path d="M10 22h4" />
  </svg>
);

const SlidersIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" x2="4" y1="21" y2="14" />
    <line x1="4" x2="4" y1="10" y2="3" />
    <line x1="12" x2="12" y1="21" y2="12" />
    <line x1="12" x2="12" y1="8" y2="3" />
    <line x1="20" x2="20" y1="21" y2="16" />
    <line x1="20" x2="20" y1="12" y2="3" />
    <line x1="1" x2="7" y1="14" y2="14" />
    <line x1="9" x2="15" y1="8" y2="8" />
    <line x1="17" x2="23" y1="16" y2="16" />
  </svg>
);

const TerminalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" x2="20" y1="19" y2="19" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

interface PeripheralsPanelProps {
  // Port 1 state
  p1Pin: number;
  p1Latch: number;
  p1External: number;

  // Port 2 state
  p2Pin: number;
  p2Latch: number;
  p2External: number;
  onToggleP2Switch: (bitIndex: number) => void;
  onSetP2External: (value: number) => void;

  // UART state
  scon: number;
  sbufTx: number;
  sbufRx: number;
  uartOutput: string;
  isUartBusy: boolean;
  baudCycles: number;
  onSendUartInput: (char: string) => void;
  onClearUartOutput: () => void;
}

// Common-anode 7-segment standard decoding patterns (active-low: 0 = lit)
// Bit 0=a, 1=b, 2=c, 3=d, 4=e, 5=f, 6=g, 7=dp
const SEVEN_SEG_DECODE: Record<number, string> = {
  0xc0: '0',
  0xf9: '1',
  0xa4: '2',
  0xb0: '3',
  0x99: '4',
  0x92: '5',
  0x82: '6',
  0xf8: '7',
  0x80: '8',
  0x90: '9',
  0x88: 'A',
  0x83: 'b',
  0xc6: 'C',
  0xa1: 'd',
  0x86: 'E',
  0x8e: 'F',
  0xbf: '-',
  0xff: ' ',
};

export const PeripheralsPanel: React.FC<PeripheralsPanelProps> = ({
  p1Pin,
  p1Latch,
  p1External,
  p2Pin,
  p2Latch,
  p2External,
  onToggleP2Switch,
  onSetP2External,
  scon,
  sbufTx,
  sbufRx,
  uartOutput,
  isUartBusy,
  baudCycles,
  onSendUartInput,
  onClearUartOutput,
}) => {
  const [terminalInput, setTerminalInput] = useState('');
  const terminalLogRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal log to bottom on output updates
  useEffect(() => {
    if (terminalLogRef.current) {
      terminalLogRef.current.scrollTop = terminalLogRef.current.scrollHeight;
    }
  }, [uartOutput]);

  const handleSendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput) return;
    onSendUartInput(terminalInput);
    setTerminalInput('');
  };

  // Seven segment active segments: active-low (bit 0 = ON)
  const segA = (p1Pin & 0x01) === 0;
  const segB = (p1Pin & 0x02) === 0;
  const segC = (p1Pin & 0x04) === 0;
  const segD = (p1Pin & 0x08) === 0;
  const segE = (p1Pin & 0x10) === 0;
  const segF = (p1Pin & 0x20) === 0;
  const segG = (p1Pin & 0x40) === 0;
  const segDP = (p1Pin & 0x80) === 0;

  // Attempt decode of common-anode 7-segment pattern
  const rawWithoutDP = p1Pin | 0x80;
  const decodedChar = SEVEN_SEG_DECODE[p1Pin] || SEVEN_SEG_DECODE[rawWithoutDP] || null;

  // SCON flags
  const ti = (scon & SCON_MASK.TI) !== 0;
  const ri = (scon & SCON_MASK.RI) !== 0;
  const ren = (scon & SCON_MASK.REN) !== 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 items-stretch">
      {/* ======================================================== */}
      {/* LEFT COLUMN: Port 1 (LEDs & 7-Segment) + Port 2 (DIPs)   */}
      {/* ======================================================== */}
      <div className="xl:col-span-7 flex flex-col gap-3.5">
        {/* PORT 1 CARD: 8-LED Bar Graph & 7-Segment Display */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101e] shadow-lg overflow-hidden flex flex-col">
          {/* Card Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#0d1322] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <LightbulbIcon className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Port 1 Visual Output (SFR 0x90)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                Pin: 0x{(p1Pin & 0xff).toString(16).toUpperCase().padStart(2, '0')}
              </span>
              <span className="text-[10px] text-emerald-400/90 font-medium bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                Active-Low (0 = ON)
              </span>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* 8-LED Bar Graph (7 cols on tablet/desktop) */}
            <div className="md:col-span-8 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  8-LED Bar Graph (P1.7 – P1.0)
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {p1Pin.toString(2).padStart(8, '0')}b
                </span>
              </div>

              {/* LED array container */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 shadow-inner flex items-center justify-between gap-1 sm:gap-2">
                {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => {
                  const isLow = ((p1Pin >> bit) & 1) === 0; // Active-low: 0 = lit
                  const latchBit = ((p1Latch >> bit) & 1);
                  return (
                    <div
                      key={bit}
                      className="flex flex-col items-center gap-1.5 flex-1 min-w-[28px]"
                      title={`P1.${bit} | Pin: ${isLow ? '0 (LOW/ON)' : '1 (HIGH/OFF)'} | Latch: ${latchBit}`}
                    >
                      {/* Round LED with realistic metallic ring & glowing dome */}
                      <div
                        className={`relative w-8 h-8 rounded-full border-2 transition-all duration-150 flex items-center justify-center ${
                          isLow
                            ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_12px_#10b981,0_0_24px_rgba(16,185,129,0.5)]'
                            : 'bg-[#121c24] border-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]'
                        }`}
                      >
                        {/* Realistic lens specular highlight reflection */}
                        <div
                          className={`absolute top-1 left-1.5 w-2.5 h-1.5 rounded-full transition-opacity ${
                            isLow ? 'bg-white/80 opacity-90' : 'bg-slate-600/30 opacity-40'
                          }`}
                        />
                        {/* Subtle center filament glow */}
                        {isLow && (
                          <div className="w-2 h-2 rounded-full bg-emerald-100 shadow-[0_0_4px_#fff]" />
                        )}
                      </div>

                      {/* Pin label */}
                      <span className="text-[10px] font-mono text-slate-400 font-semibold">
                        P1.{bit}
                      </span>
                      {/* State bit indicator */}
                      <span
                        className={`text-[9px] font-mono px-1 rounded transition-colors ${
                          isLow
                            ? 'text-emerald-300 bg-emerald-950/80 font-bold'
                            : 'text-slate-500 bg-slate-900/60'
                        }`}
                      >
                        {isLow ? '0' : '1'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span>Green halo indicates pin pulled LOW (0)</span>
                <span className="font-mono text-slate-500">Latch: 0x{p1Latch.toString(16).toUpperCase().padStart(2, '0')}</span>
              </div>
            </div>

            {/* 7-Segment Display (4 cols on tablet/desktop) */}
            <div className="md:col-span-4 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-800/80 pt-3 md:pt-0 md:pl-4">
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  7-Segment
                </span>
                <span className="text-[10px] font-mono text-rose-400 bg-rose-950/50 border border-rose-900/40 px-1.5 py-0.2 rounded">
                  Common Anode
                </span>
              </div>

              {/* 7-Segment Module Chassis */}
              <div className="relative bg-[#05070c] border border-slate-800 rounded-xl p-3 shadow-inner flex flex-col items-center justify-center">
                {/* Authentic 7-Segment SVG */}
                <svg
                  viewBox="0 0 130 180"
                  className="w-24 h-32 select-none filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                >
                  <defs>
                    {/* Glowing filter for lit segments */}
                    <filter id="red-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Slanted group for authentic LED display angle */}
                  <g transform="skewX(-5) translate(8, 6)">
                    {/* Segment A (P1.0) - Top */}
                    <polygon
                      points="26,12 36,4 84,4 94,12 84,20 36,20"
                      className={`transition-all duration-100 ${
                        segA
                          ? 'fill-rose-500 filter-[url(#red-glow)]'
                          : 'fill-[#1c1214] opacity-25'
                      }`}
                    />

                    {/* Segment B (P1.1) - Top Right */}
                    <polygon
                      points="96,16 104,24 104,74 96,82 88,74 88,24"
                      className={`transition-all duration-100 ${
                        segB
                          ? 'fill-rose-500 filter-[url(#red-glow)]'
                          : 'fill-[#1c1214] opacity-25'
                      }`}
                    />

                    {/* Segment C (P1.2) - Bottom Right */}
                    <polygon
                      points="96,88 104,96 104,146 96,154 88,146 88,96"
                      className={`transition-all duration-100 ${
                        segC
                          ? 'fill-rose-500 filter-[url(#red-glow)]'
                          : 'fill-[#1c1214] opacity-25'
                      }`}
                    />

                    {/* Segment D (P1.3) - Bottom */}
                    <polygon
                      points="26,158 36,150 84,150 94,158 84,166 36,166"
                      className={`transition-all duration-100 ${
                        segD
                          ? 'fill-rose-500 filter-[url(#red-glow)]'
                          : 'fill-[#1c1214] opacity-25'
                      }`}
                    />

                    {/* Segment E (P1.4) - Bottom Left */}
                    <polygon
                      points="24,88 32,96 32,146 24,154 16,146 16,96"
                      className={`transition-all duration-100 ${
                        segE
                          ? 'fill-rose-500 filter-[url(#red-glow)]'
                          : 'fill-[#1c1214] opacity-25'
                      }`}
                    />

                    {/* Segment F (P1.5) - Top Left */}
                    <polygon
                      points="24,16 32,24 32,74 24,82 16,74 16,24"
                      className={`transition-all duration-100 ${
                        segF
                          ? 'fill-rose-500 filter-[url(#red-glow)]'
                          : 'fill-[#1c1214] opacity-25'
                      }`}
                    />

                    {/* Segment G (P1.6) - Middle */}
                    <polygon
                      points="26,85 36,77 84,77 94,85 84,93 36,93"
                      className={`transition-all duration-100 ${
                        segG
                          ? 'fill-rose-500 filter-[url(#red-glow)]'
                          : 'fill-[#1c1214] opacity-25'
                      }`}
                    />

                    {/* Segment DP (P1.7) - Decimal Point */}
                    <circle
                      cx="112"
                      cy="158"
                      r="6"
                      className={`transition-all duration-100 ${
                        segDP
                          ? 'fill-rose-500 filter-[url(#red-glow)]'
                          : 'fill-[#1c1214] opacity-25'
                      }`}
                    />
                  </g>
                </svg>

                {/* Decoded value badge */}
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono">
                  <span className="text-slate-500">Decoded:</span>
                  <span className="font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/40">
                    {decodedChar !== null ? `'${decodedChar}'` : 'None'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PORT 2 CARD: 8-DIP Switch Panel (SFR 0xA0) */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101e] shadow-lg overflow-hidden flex flex-col">
          {/* Card Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#0d1322] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <SlidersIcon className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Port 2 8-DIP Switch Inputs (SFR 0xA0)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                Pin: 0x{(p2Pin & 0xff).toString(16).toUpperCase().padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={() => onSetP2External(p2External === 0xff ? 0x00 : 0xff)}
                className="text-[10px] text-sky-400 hover:text-sky-300 bg-sky-950/50 hover:bg-sky-900/50 border border-sky-800/40 px-2 py-0.5 rounded transition-colors"
                title="Toggle all switches simultaneously"
              >
                {p2External === 0xff ? 'Pull All LOW (0x00)' : 'Release All (0xFF)'}
              </button>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Click any switch to toggle between <strong>ON (Pulls pin to 0)</strong> and{' '}
                <strong>OFF (Floats HIGH 1)</strong>
              </span>
              <span className="font-mono text-slate-500">Ext: {p2External.toString(2).padStart(8, '0')}b</span>
            </div>

            {/* Tactile Red DIP Switch Chassis */}
            <div className="bg-[#8b181b] border-2 border-[#5c0e10] rounded-xl p-3.5 shadow-2xl flex items-center justify-between gap-1 sm:gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((bit) => {
                // External switch: bit=0 means ON (closed to GND, pulls low)
                const isPulledLow = ((p2External >> bit) & 1) === 0;
                const pinBit = ((p2Pin >> bit) & 1);

                return (
                  <div
                    key={bit}
                    className="flex flex-col items-center gap-1.5 flex-1 min-w-[28px]"
                  >
                    {/* "ON" label at top of DIP switch */}
                    <span className="text-[8px] font-bold text-white/80 uppercase tracking-tighter">
                      ON
                    </span>

                    {/* Rocker switch slot */}
                    <button
                      type="button"
                      onClick={() => onToggleP2Switch(bit)}
                      className="group relative w-7 h-14 bg-[#1a0809] border border-[#3b1214] rounded-md shadow-inner flex flex-col justify-between p-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400 transition-transform active:scale-95"
                      title={`P2.${bit} Switch - Click to toggle. State: ${isPulledLow ? 'ON (Pull LOW 0)' : 'OFF (Float 1)'}`}
                    >
                      {/* Sliding white actuator handle */}
                      <div
                        className={`w-full h-6 rounded-sm bg-gradient-to-b from-slate-100 to-slate-300 shadow-md transition-all duration-150 flex items-center justify-center ${
                          isPulledLow
                            ? 'translate-y-0 border-t-2 border-white'
                            : 'translate-y-6 border-b-2 border-slate-400'
                        }`}
                      >
                        {/* Tactile grip ridges */}
                        <div className="flex flex-col gap-0.5 w-3/4">
                          <div className="h-[1.5px] bg-slate-400 rounded-full" />
                          <div className="h-[1.5px] bg-slate-400 rounded-full" />
                          <div className="h-[1.5px] bg-slate-400 rounded-full" />
                        </div>
                      </div>
                    </button>

                    {/* Switch number 1..8 */}
                    <span className="text-[10px] font-mono text-white/90 font-bold">
                      {bit + 1}
                    </span>

                    {/* Status badge below switch */}
                    <span
                      className={`text-[9px] font-mono px-1 py-0.5 rounded transition-colors ${
                        pinBit === 0
                          ? 'text-amber-300 bg-amber-950/90 font-bold border border-amber-800/40'
                          : 'text-slate-300 bg-slate-900/80 border border-slate-800'
                      }`}
                    >
                      P2.{bit}={pinBit}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1 border-t border-slate-800/50">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Quasi-bidirectional: Pin = Latch & External Switch</span>
              </div>
              <span className="font-mono text-slate-500">
                Latch: 0x{p2Latch.toString(16).toUpperCase().padStart(2, '0')} | Pin: 0x{p2Pin.toString(16).toUpperCase().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* RIGHT COLUMN: Virtual UART Terminal (SCON 0x98, SBUF 0x99) */}
      {/* ======================================================== */}
      <div className="xl:col-span-5 rounded-xl border border-slate-800 bg-[#0b101e] shadow-lg overflow-hidden flex flex-col">
        {/* Terminal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#0d1322] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <TerminalIcon className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Virtual UART Terminal (SBUF 0x99)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* TI flag status */}
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                ti
                  ? 'text-emerald-300 bg-emerald-950/80 border-emerald-700/60 font-bold shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                  : 'text-slate-500 bg-slate-900/50 border-slate-800'
              }`}
              title="TI (Transmit Interrupt flag): Set when transmission completes"
            >
              TI={ti ? '1' : '0'}
            </span>

            {/* RI flag status */}
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                ri
                  ? 'text-amber-300 bg-amber-950/80 border-amber-700/60 font-bold shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                  : 'text-slate-500 bg-slate-900/50 border-slate-800'
              }`}
              title="RI (Receive Interrupt flag): Set when byte arrives in SBUF"
            >
              RI={ri ? '1' : '0'}
            </span>

            {/* REN flag status */}
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                ren
                  ? 'text-sky-300 bg-sky-950/80 border-sky-800/60'
                  : 'text-slate-500 bg-slate-900/50 border-slate-800'
              }`}
              title="REN (Receiver Enable bit)"
            >
              REN={ren ? '1' : '0'}
            </span>

            {/* Clear Button */}
            <button
              type="button"
              onClick={onClearUartOutput}
              className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800 rounded transition-colors"
              title="Clear terminal log"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Terminal Status Subbar */}
        <div className="flex items-center justify-between bg-slate-950/60 border-b border-slate-800/60 px-4 py-1.5 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              TX Busy:{' '}
              <strong className={isUartBusy ? 'text-amber-400' : 'text-slate-500'}>
                {isUartBusy ? 'YES (TXing)' : 'IDLE'}
              </strong>
            </span>
            <span>
              Duration: <strong className="text-sky-400">{baudCycles} cycles</strong>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              TX: 0x{sbufTx.toString(16).toUpperCase().padStart(2, '0')}{' '}
              {sbufTx >= 32 && sbufTx <= 126 ? `('${String.fromCharCode(sbufTx)}')` : ''}
            </span>
            <span>
              RX: 0x{sbufRx.toString(16).toUpperCase().padStart(2, '0')}{' '}
              {sbufRx >= 32 && sbufRx <= 126 ? `('${String.fromCharCode(sbufRx)}')` : ''}
            </span>
          </div>
        </div>

        {/* Phosphor CRT / Monospaced Terminal Output Display */}
        <div
          ref={terminalLogRef}
          className="flex-1 p-3 bg-[#03060c] font-mono text-xs text-emerald-400 overflow-y-auto whitespace-pre-wrap min-h-[200px] max-h-[310px] select-text border-b border-slate-800/80 shadow-[inset_0_2px_8px_rgba(0,0,0,0.9)]"
          style={{
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            textShadow: '0 0 4px rgba(52, 211, 153, 0.4)',
          }}
        >
          {uartOutput ? (
            <span>{uartOutput}</span>
          ) : (
            <span className="text-slate-600 italic select-none">
              [Virtual 8051 UART Terminal ready. Output stream from CPU writes to SBUF (0x99) will appear here...]
            </span>
          )}
          {/* Glowing blinking terminal cursor */}
          <span className="inline-block w-2 h-3.5 ml-1 bg-emerald-400 align-middle animate-pulse" />
        </div>

        {/* Keyboard Input Form */}
        <form
          onSubmit={handleSendSubmit}
          className="p-2.5 bg-[#0d1322] flex items-center gap-2"
        >
          <div className="flex items-center text-xs font-mono text-emerald-500 font-bold pl-1.5">
            &gt;
          </div>
          <input
            type="text"
            value={terminalInput}
            onChange={(e) => setTerminalInput(e.target.value)}
            placeholder="Type text and press Enter or Send to feed into SBUF..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={!terminalInput}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-slate-950 font-semibold text-xs rounded flex items-center gap-1 transition-colors shadow-sm"
          >
            <SendIcon className="h-3 w-3" />
            <span>Send</span>
          </button>
        </form>

        {/* Quick Send Helper Chips */}
        <div className="px-3 py-2 bg-slate-950/80 border-t border-slate-800/40 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-slate-500 text-[10px] uppercase font-semibold">Quick Feed:</span>
            {['A', '1', 'OK', '\\r\\n'].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => onSendUartInput(sample === '\\r\\n' ? '\r\n' : sample)}
                className="px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono text-[10px] transition-colors border border-slate-700/50"
              >
                {sample}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500">Feeds into SBUF & sets RI</span>
        </div>
      </div>
    </div>
  );
};
