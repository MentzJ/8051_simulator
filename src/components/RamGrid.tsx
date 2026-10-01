import React, { useState } from 'react';
import { Database, Info } from 'lucide-react';

interface RamGridProps {
  ram: Uint8Array;
  modifiedAddresses: Set<number>;
  sp: number;
  activeBank: number;
}

export const RamGrid: React.FC<RamGridProps> = ({
  ram,
  modifiedAddresses,
  sp,
  activeBank,
}) => {
  const [hoveredAddr, setHoveredAddr] = useState<number | null>(null);

  const getRegionInfo = (addr: number) => {
    if (addr < 0x08) return { name: 'Bank 0 (R0-R7)', type: 'bank0', color: 'text-indigo-400' };
    if (addr < 0x10) return { name: 'Bank 1 (R0-R7)', type: 'bank1', color: 'text-indigo-400' };
    if (addr < 0x18) return { name: 'Bank 2 (R0-R7)', type: 'bank2', color: 'text-indigo-400' };
    if (addr < 0x20) return { name: 'Bank 3 (R0-R7)', type: 'bank3', color: 'text-indigo-400' };
    if (addr < 0x30) {
      const bitStart = (addr - 0x20) * 8;
      return {
        name: `Bit RAM (Bits 0x${bitStart.toString(16).toUpperCase()}-0x${(bitStart + 7).toString(16).toUpperCase()})`,
        type: 'bit',
        color: 'text-sky-400',
      };
    }
    return { name: 'Scratchpad RAM', type: 'scratch', color: 'text-slate-400' };
  };

  const hoveredVal = hoveredAddr !== null && hoveredAddr < 128 ? ram[hoveredAddr] : null;
  const hoveredRegion = hoveredAddr !== null ? getRegionInfo(hoveredAddr) : null;

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-[#0b101e] shadow-lg overflow-hidden">
      {/* Header and Legend */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-[#0d1322] px-4 py-2.5 gap-2">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-sky-400" />
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
            Internal RAM (0x00 – 0x7F: 128 Bytes)
          </span>
          <span className="text-[11px] font-mono text-slate-500">16×8 Hex Matrix</span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-indigo-500/30 border border-indigo-400/60" />
            <span className="text-slate-400">Banks 0–3 (00–1F)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-sky-500/30 border border-sky-400/60" />
            <span className="text-slate-400">Bit RAM (20–2F)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-slate-800 border border-slate-700" />
            <span className="text-slate-400">Scratchpad (30–7F)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-amber-400 animate-pulse" />
            <span className="text-amber-300 font-semibold">Modified</span>
          </div>
        </div>
      </div>

      {/* 16x8 Hex Matrix Grid */}
      <div className="overflow-x-auto p-3">
        <div className="min-w-[620px]">
          {/* Column Headers: +0 through +F */}
          <div className="grid grid-cols-[56px_repeat(16,minmax(0,1fr))] gap-1.5 text-center font-mono text-[11px] text-slate-500 font-bold mb-1">
            <div className="text-left pl-1">Offset</div>
            {Array.from({ length: 16 }).map((_, c) => (
              <div key={c} className="text-slate-400">
                +{c.toString(16).toUpperCase()}
              </div>
            ))}
          </div>

          {/* 8 Rows: 00, 10, 20, 30, 40, 50, 60, 70 */}
          {Array.from({ length: 8 }).map((_, r) => {
            const rowBase = r * 16;
            return (
              <div
                key={r}
                className="grid grid-cols-[56px_repeat(16,minmax(0,1fr))] gap-1.5 items-center font-mono text-xs my-1"
              >
                {/* Row Header */}
                <div className="text-[11px] font-bold text-slate-500 pl-1">
                  0x{rowBase.toString(16).toUpperCase().padStart(2, '0')}:
                </div>

                {/* 16 Cells in this row */}
                {Array.from({ length: 16 }).map((_, c) => {
                  const addr = rowBase + c;
                  const val = ram[addr] ?? 0;
                  const isModified = modifiedAddresses.has(addr);
                  const isSP = sp === addr;
                  const isBankReg = addr < 0x20;
                  const isActiveBankReg =
                    addr >= activeBank * 8 && addr < activeBank * 8 + 8;
                  const isBitRam = addr >= 0x20 && addr < 0x30;

                  let baseStyle = 'border-slate-800/80 bg-slate-900/60 text-slate-500';
                  if (isActiveBankReg) {
                    baseStyle = 'border-indigo-500/50 bg-indigo-950/40 text-indigo-300';
                  } else if (isBankReg) {
                    baseStyle = 'border-slate-800/80 bg-slate-900/40 text-slate-400';
                  } else if (isBitRam) {
                    baseStyle = 'border-sky-900/40 bg-sky-950/20 text-sky-300/80';
                  }

                  if (val > 0) {
                    baseStyle += ' font-bold text-slate-100';
                  }

                  return (
                    <div
                      key={addr}
                      onMouseEnter={() => setHoveredAddr(addr)}
                      onMouseLeave={() => setHoveredAddr(null)}
                      className={`relative flex h-8 items-center justify-center rounded border text-xs font-mono transition-all cursor-pointer ${baseStyle} ${
                        isModified ? 'cell-modified' : ''
                      } ${
                        hoveredAddr === addr
                          ? 'ring-2 ring-sky-400 z-10 scale-105 bg-slate-800 text-white'
                          : 'hover:border-slate-600'
                      }`}
                      title={`Address: 0x${addr.toString(16).toUpperCase()} | Value: 0x${val
                        .toString(16)
                        .toUpperCase()
                        .padStart(2, '0')}`}
                    >
                      {/* Stack Pointer marker dot */}
                      {isSP && (
                        <span
                          className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80"
                          title="Stack Pointer (SP)"
                        />
                      )}

                      {/* Active Bank Register R0..R7 marker */}
                      {isActiveBankReg && (
                        <span className="absolute -bottom-0.5 text-[8px] font-sans text-indigo-400 leading-none">
                          R{addr & 7}
                        </span>
                      )}

                      <span>{val.toString(16).toUpperCase().padStart(2, '0')}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cell Inspector Hover Banner */}
      <div className="flex items-center justify-between border-t border-slate-800/80 bg-[#080d19] px-4 py-2 text-xs font-mono">
        {hoveredAddr !== null && hoveredVal !== null && hoveredRegion ? (
          <div className="flex flex-wrap items-center gap-4 text-slate-300">
            <div>
              <span className="text-slate-500">ADDR: </span>
              <strong className="text-sky-300">
                0x{hoveredAddr.toString(16).toUpperCase().padStart(2, '0')}
              </strong>
              <span className="text-slate-500"> ({hoveredAddr})</span>
            </div>
            <div>
              <span className="text-slate-500">VALUE: </span>
              <strong className="text-amber-300">
                0x{hoveredVal.toString(16).toUpperCase().padStart(2, '0')}
              </strong>
              <span className="text-slate-500">
                {' '}
                (#{hoveredVal}, {hoveredVal.toString(2).padStart(8, '0')}b)
              </span>
            </div>
            <div>
              <span className="text-slate-500">CHAR: </span>
              <strong className="text-slate-200">
                {hoveredVal >= 32 && hoveredVal <= 126 ? `'${String.fromCharCode(hoveredVal)}'` : '·'}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">REGION: </span>
              <strong className={hoveredRegion.color}>{hoveredRegion.name}</strong>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-500 text-[11px]">
            <Info className="h-3.5 w-3.5 text-slate-500" />
            <span>Hover over any memory cell to inspect address, decimal, binary, and architectural region.</span>
          </div>
        )}

        <div className="text-[11px] text-slate-500">
          SP Target: <span className="text-emerald-400 font-bold">0x{sp.toString(16).toUpperCase().padStart(2, '0')}</span>
        </div>
      </div>
    </div>
  );
};
