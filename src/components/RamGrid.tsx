import React, { useState } from 'react';

const DatabaseIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
  </svg>
);

const CpuMemoryIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 7h10v10H7z" />
    <path d="M10 3v4" />
    <path d="M14 3v4" />
    <path d="M10 17v4" />
    <path d="M14 17v4" />
  </svg>
);

const InfoIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const ChevronLeftIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

interface RamGridProps {
  ram: Uint8Array;
  modifiedAddresses: Set<number>;
  sp: number;
  activeBank: number;
  xramWindow?: Uint8Array;
  xramOffset?: number;
  modifiedXramAddresses?: Set<number>;
  onRequestXramOffset?: (offset: number) => void;
}

export const RamGrid: React.FC<RamGridProps> = ({
  ram,
  modifiedAddresses,
  sp,
  activeBank,
  xramWindow = new Uint8Array(256),
  xramOffset = 0,
  modifiedXramAddresses = new Set(),
  onRequestXramOffset,
}) => {
  const [activeTab, setActiveTab] = useState<'iram' | 'xram'>('iram');
  const [hoveredAddr, setHoveredAddr] = useState<number | null>(null);
  const [jumpInput, setJumpInput] = useState<string>('');

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

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jumpInput) return;
    let clean = jumpInput.trim();
    if (clean.toLowerCase().startsWith('0x')) {
      clean = clean.slice(2);
    }
    const parsed = parseInt(clean, 16);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(65536 - 256, parsed & ~0x0f));
      onRequestXramOffset?.(clamped);
      setJumpInput('');
    }
  };

  const handleQuickJump = (target: number) => {
    onRequestXramOffset?.(target);
  };

  const handlePagePrev = () => {
    const next = Math.max(0, xramOffset - 256);
    onRequestXramOffset?.(next);
  };

  const handlePageNext = () => {
    const next = Math.min(65536 - 256, xramOffset + 256);
    onRequestXramOffset?.(next);
  };

  // Inspect hovered cell values
  const hoveredVal =
    hoveredAddr !== null
      ? activeTab === 'iram'
        ? hoveredAddr < 128
          ? ram[hoveredAddr]
          : null
        : hoveredAddr >= xramOffset && hoveredAddr < xramOffset + 256
        ? xramWindow[hoveredAddr - xramOffset]
        : null
      : null;

  const hoveredRegion =
    hoveredAddr !== null && activeTab === 'iram' ? getRegionInfo(hoveredAddr) : null;

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-[#0b101e] shadow-lg overflow-hidden">
      {/* Header with Tabs and Controls */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-[#0d1322] px-4 py-2.5 gap-2">
        {/* Memory Tabs */}
        <div className="flex items-center gap-1.5 p-0.5 bg-slate-950/80 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('iram')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'iram'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <DatabaseIcon className="h-3.5 w-3.5" />
            <span>Internal RAM (128B)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('xram')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'xram'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CpuMemoryIcon className="h-3.5 w-3.5" />
            <span>External RAM (64KB XRAM)</span>
          </button>
        </div>

        {/* Tab Specific Header Content */}
        {activeTab === 'iram' ? (
          /* Internal RAM Legend */
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
        ) : (
          /* External RAM (XRAM) Controls: Jump Input & Page Stepper */
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick jump presets */}
            <div className="hidden sm:flex items-center gap-1">
              {[0x0000, 0x1000, 0x2000, 0x8000].map((addr) => (
                <button
                  key={addr}
                  type="button"
                  onClick={() => handleQuickJump(addr)}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                    xramOffset === addr
                      ? 'bg-indigo-950 text-indigo-300 border-indigo-700 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  0x{addr.toString(16).toUpperCase().padStart(4, '0')}
                </button>
              ))}
            </div>

            {/* Address Jump Form */}
            <form onSubmit={handleJumpSubmit} className="flex items-center gap-1">
              <div className="relative">
                <input
                  type="text"
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  placeholder="Jump (e.g. 2000)..."
                  className="w-28 bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-xs text-slate-100 font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center gap-1 transition-colors"
                title="Jump to address"
              >
                <SearchIcon className="h-3 w-3" />
                <span>Go</span>
              </button>
            </form>

            {/* Pagination buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePagePrev}
                disabled={xramOffset <= 0}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                title="Previous 256 bytes"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] font-mono text-indigo-400 px-1 font-bold">
                0x{xramOffset.toString(16).toUpperCase().padStart(4, '0')} – 0x{(xramOffset + 255).toString(16).toUpperCase().padStart(4, '0')}
              </span>
              <button
                type="button"
                onClick={handlePageNext}
                disabled={xramOffset >= 65536 - 256}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                title="Next 256 bytes"
              >
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Grid Display */}
      {activeTab === 'iram' ? (
        /* Internal RAM 16x8 Matrix (0x00 - 0x7F) */
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
      ) : (
        /* External RAM 16x16 Matrix (Window of 256 bytes) */
        <div className="overflow-x-auto p-3">
          <div className="min-w-[660px]">
            {/* Column Headers */}
            <div className="grid grid-cols-[68px_repeat(16,minmax(0,1fr))] gap-1.5 text-center font-mono text-[11px] text-slate-500 font-bold mb-1">
              <div className="text-left pl-1">Offset</div>
              {Array.from({ length: 16 }).map((_, c) => (
                <div key={c} className="text-indigo-400/80">
                  +{c.toString(16).toUpperCase()}
                </div>
              ))}
            </div>

            {/* 16 Rows = 256 bytes window */}
            {Array.from({ length: 16 }).map((_, r) => {
              const rowBase = xramOffset + r * 16;
              return (
                <div
                  key={r}
                  className="grid grid-cols-[68px_repeat(16,minmax(0,1fr))] gap-1.5 items-center font-mono text-xs my-1"
                >
                  {/* Row Header */}
                  <div className="text-[11px] font-bold text-indigo-400/90 pl-1">
                    0x{rowBase.toString(16).toUpperCase().padStart(4, '0')}:
                  </div>

                  {/* 16 Cells in this row */}
                  {Array.from({ length: 16 }).map((_, c) => {
                    const addr = rowBase + c;
                    const val = xramWindow[r * 16 + c] ?? 0;
                    const isModified = modifiedXramAddresses.has(addr);

                    let baseStyle = 'border-slate-800/80 bg-slate-900/50 text-slate-500';
                    if (val > 0) {
                      baseStyle = 'border-indigo-900/60 bg-indigo-950/30 font-bold text-slate-100';
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
                            ? 'ring-2 ring-indigo-400 z-10 scale-105 bg-slate-800 text-white'
                            : 'hover:border-slate-600'
                        }`}
                        title={`XRAM: 0x${addr.toString(16).toUpperCase().padStart(4, '0')} | Value: 0x${val
                          .toString(16)
                          .toUpperCase()
                          .padStart(2, '0')}`}
                      >
                        <span>{val.toString(16).toUpperCase().padStart(2, '0')}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cell Inspector Hover Banner */}
      <div className="flex items-center justify-between border-t border-slate-800/80 bg-[#080d19] px-4 py-2 text-xs font-mono">
        {hoveredAddr !== null && hoveredVal !== null ? (
          <div className="flex flex-wrap items-center gap-4 text-slate-300">
            <div>
              <span className="text-slate-500">ADDR: </span>
              <strong className="text-sky-300">
                0x
                {hoveredAddr
                  .toString(16)
                  .toUpperCase()
                  .padStart(activeTab === 'iram' ? 2 : 4, '0')}
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
                {hoveredVal >= 32 && hoveredVal <= 126
                  ? `'${String.fromCharCode(hoveredVal)}'`
                  : '·'}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">SPACE: </span>
              <strong className={activeTab === 'iram' ? hoveredRegion?.color : 'text-indigo-400'}>
                {activeTab === 'iram' ? hoveredRegion?.name : 'External Data Memory (MOVX)'}
              </strong>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-500 text-[11px]">
            <InfoIcon className="h-3.5 w-3.5 text-slate-500" />
            <span>
              Hover over any cell to inspect hexadecimal, decimal, binary, and ASCII representation.
            </span>
          </div>
        )}

        <div className="text-[11px] text-slate-500">
          {activeTab === 'iram' ? (
            <>
              SP Target:{' '}
              <span className="text-emerald-400 font-bold">
                0x{sp.toString(16).toUpperCase().padStart(2, '0')}
              </span>
            </>
          ) : (
            <>
              Space: <span className="text-indigo-400 font-bold">64 KB (0000H–FFFFH)</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
