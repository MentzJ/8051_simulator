import React, { useRef, useEffect } from 'react';
import { Code2, AlertTriangle, CheckCircle2 } from './Icons';
import type { SourceMapEntry, AssemblyError } from '../assembler';

interface CodeEditorProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  activeLine: number | null;
  sourceMap: SourceMapEntry[];
  errors: AssemblyError[];
  byteCount: number;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChangeCode,
  activeLine,
  sourceMap,
  errors,
  byteCount,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineGutterRef = useRef<HTMLDivElement>(null);

  const lines = code.split('\n');
  const lineCount = Math.max(lines.length, 1);

  // Sync scroll between textarea and line gutter
  const handleScroll = () => {
    if (textareaRef.current && lineGutterRef.current) {
      lineGutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Build a lookup map from 1-based line number to ROM PC offset
  const pcByLine = new Map<number, number>();
  for (const entry of sourceMap) {
    pcByLine.set(entry.line, entry.pc);
  }

  // Build error lookup
  const errorByLine = new Map<number, string>();
  for (const err of errors) {
    errorByLine.set(err.line, err.message);
  }

  // Handle Tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value;
      const newValue = value.substring(0, start) + '    ' + value.substring(end);
      onChangeCode(newValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-[#0b101e] shadow-lg overflow-hidden">
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#0d1322] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-sky-400" />
          <span className="text-xs font-semibold text-slate-200">assembly.asm</span>
          <span className="text-[11px] text-slate-500 font-mono">({lineCount} lines)</span>
        </div>

        {/* Compiler Status */}
        <div className="flex items-center gap-2 text-xs">
          {errors.length > 0 ? (
            <div className="flex items-center gap-1.5 rounded bg-rose-500/10 px-2 py-0.5 text-rose-400 border border-rose-500/20 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{errors.length} assembly error{errors.length > 1 ? 's' : ''}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400 border border-emerald-500/20 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{byteCount} bytes assembled</span>
            </div>
          )}
        </div>
      </div>

      {/* Editor Container with Line Numbers Gutter */}
      <div className="relative flex flex-1 overflow-hidden font-mono text-[13px] leading-[22px]">
        {/* Line Numbers & PC Gutter */}
        <div
          ref={lineGutterRef}
          className="select-none overflow-hidden border-r border-slate-800/80 bg-[#080d19] py-3 text-right text-slate-500 font-mono text-xs"
          style={{ width: '84px' }}
        >
          {Array.from({ length: lineCount }).map((_, idx) => {
            const lineNum = idx + 1;
            const isActive = activeLine === lineNum;
            const hasError = errorByLine.has(lineNum);
            const pcOffset = pcByLine.get(lineNum);

            return (
              <div
                key={lineNum}
                className={`flex items-center justify-between px-2 h-[22px] transition-colors ${
                  isActive
                    ? 'bg-amber-500/20 text-amber-300 font-bold border-r-2 border-amber-400'
                    : hasError
                    ? 'bg-rose-500/20 text-rose-400 font-bold'
                    : 'hover:text-slate-400'
                }`}
              >
                {/* Active arrow or PC offset */}
                <span className="w-5 text-left text-[10px]">
                  {isActive ? (
                    <span className="text-amber-400 animate-pulse font-bold">▶</span>
                  ) : pcOffset !== undefined ? (
                    <span className="text-[10px] text-slate-600 font-mono">
                      {pcOffset.toString(16).toUpperCase().padStart(2, '0')}
                    </span>
                  ) : null}
                </span>

                {/* Line number */}
                <span className="text-right">{lineNum}</span>
              </div>
            );
          })}
        </div>

        {/* Textarea Overlay for Active Line Highlight */}
        <div className="relative flex-1 h-full overflow-hidden">
          {/* Active Line Background Strip */}
          {activeLine !== null && activeLine <= lineCount && (
            <div
              className="pointer-events-none absolute left-0 right-0 h-[22px] bg-sky-500/10 border-y border-sky-500/20 transition-all z-0"
              style={{
                top: `${(activeLine - 1) * 22 + 12 - (textareaRef.current?.scrollTop || 0)}px`,
              }}
            />
          )}

          {/* Actual Code Textarea */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => onChangeCode(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            className="relative z-10 h-full w-full resize-none bg-transparent py-3 px-3 text-slate-200 outline-none placeholder:text-slate-600 selection:bg-sky-500/30 font-mono text-[13px] leading-[22px] overflow-auto whitespace-pre"
            placeholder="; Enter Intel 8051 assembly code here..."
          />
        </div>
      </div>

      {/* Assembly Errors Footer Drawer if errors exist */}
      {errors.length > 0 && (
        <div className="border-t border-rose-500/30 bg-rose-950/40 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-rose-300 mb-1">
            <AlertTriangle className="h-4 w-4" />
            <span>Assembly Errors:</span>
          </div>
          <div className="max-h-24 overflow-y-auto space-y-1">
            {errors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 text-rose-200/90 font-mono text-[11px]">
                <span className="rounded bg-rose-500/20 px-1 py-0.2 text-rose-300 font-bold">
                  Line {err.line}
                </span>
                <span>{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
