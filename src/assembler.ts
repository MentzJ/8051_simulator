/**
 * 2-Pass 8051 Assembler
 * 
 * Supports standard Intel 8051 syntax:
 * - Case-insensitive mnemonics, registers, and symbols
 * - Numbers in Hex (20H, 0FFH, 0x20), Decimal (32), Binary (00100000B), ASCII ('A')
 * - Directives: ORG, DB, EQU, END
 * - Labels: "LABEL:" or "LABEL: INSTR"
 * - Pass 1: Strip comments (';'), extract labels into a symbol table mapping names to 16-bit ROM offsets.
 * - Pass 2: Emit Uint8Array of machine code and source-map array { line: number, pc: number, source: string }.
 */

import { SFR } from './types.js';

export interface SourceMapEntry {
  /** 1-based source line number */
  line: number;
  /** 16-bit ROM Program Counter offset */
  pc: number;
  /** Original trimmed source code */
  source: string;
}

export interface AssemblyError {
  line: number;
  message: string;
}

export interface AssemblyResult {
  /** Assembled binary code buffer */
  code: Uint8Array;
  /** Maximum program length in bytes */
  byteCount: number;
  /** Starting PC address (from first ORG or 0) */
  entryPC: number;
  /** Source map mapping lines to ROM PC */
  sourceMap: SourceMapEntry[];
  /** Symbol table (labels/constants to 16-bit values) */
  symbolTable: Map<string, number>;
  /** Any assembly errors encountered */
  errors: AssemblyError[];
}

// Built-in standard SFR direct addresses
export const STANDARD_SYMBOLS: Record<string, number> = {
  P0: SFR.P0,
  SP: SFR.SP,
  DPL: SFR.DPL,
  DPH: SFR.DPH,
  PCON: SFR.PCON,
  TCON: SFR.TCON,
  TMOD: SFR.TMOD,
  TL0: SFR.TL0,
  TL1: SFR.TL1,
  TH0: SFR.TH0,
  TH1: SFR.TH1,
  P1: SFR.P1,
  SCON: SFR.SCON,
  SBUF: SFR.SBUF,
  P2: SFR.P2,
  IE: SFR.IE,
  P3: SFR.P3,
  IP: SFR.IP,
  PSW: SFR.PSW,
  ACC: SFR.ACC,
  B: SFR.B,
  A: SFR.ACC, // In direct address context, A refers to ACC (0xE0)

  // Standard bit addresses
  CY: 0xD7,
  AC: 0xD6,
  F0: 0xD5,
  RS1: 0xD4,
  RS0: 0xD3,
  OV: 0xD2,
  P: 0xD0,

  // TCON bits (0x88)
  TF1: 0x8F,
  TR1: 0x8E,
  TF0: 0x8D,
  TR0: 0x8C,
  IE1: 0x8B,
  IT1: 0x8A,
  IE0: 0x89,
  IT0: 0x88,

  // IE bits (0xA8)
  EA:  0xAF,
  ET2: 0xAD,
  ES:  0xAC,
  ET1: 0xAB,
  EX1: 0xAA,
  ET0: 0xA9,
  EX0: 0xA8,

  // IP bits (0xB8)
  PT2: 0xBD,
  PS:  0xBC,
  PT1: 0xBB,
  PX1: 0xBA,
  PT0: 0xB9,
  PX0: 0xB8,
};

/**
 * Parses numeric literals in various 8051 assembler formats:
 * - Hex: 20H, 0FFH, 0x20, 0X20, #20H, #0x20
 * - Binary: 00100000B, 101b
 * - Decimal: 10, 255, 10D
 * - Character: 'A', "A"
 */
export function parseNumber(raw: string, symbols?: Map<string, number>, currentPC: number = 0): number | null {
  let str = raw.trim();
  if (!str) return null;

  // Strip leading '#' for immediate values
  if (str.startsWith('#')) {
    str = str.slice(1).trim();
  }

  // Location counter $
  if (str === '$') {
    return currentPC;
  }

  // Single character literal 'c' or "c"
  if ((str.startsWith("'") && str.endsWith("'") && str.length === 3) ||
      (str.startsWith('"') && str.endsWith('"') && str.length === 3)) {
    return str.charCodeAt(1);
  }

  const upper = str.toUpperCase();

  // Check symbol table / standard symbols first if provided
  if (symbols && symbols.has(upper)) {
    return symbols.get(upper)!;
  }
  if (STANDARD_SYMBOLS[upper] !== undefined) {
    return STANDARD_SYMBOLS[upper];
  }

  // Bit notation: REG.BIT or RAM.BIT (e.g., PSW.7, P1.0, 20H.1)
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 2) {
      const byteVal = parseNumber(parts[0], symbols, currentPC);
      const bitVal = parseNumber(parts[1], symbols, currentPC);
      if (byteVal !== null && bitVal !== null && bitVal >= 0 && bitVal <= 7) {
        if (byteVal >= 0x20 && byteVal <= 0x2F) {
          return (byteVal - 0x20) * 8 + bitVal;
        } else if (byteVal >= 0x80 && byteVal <= 0xFF && (byteVal % 8 === 0)) {
          return byteVal + bitVal;
        }
      }
    }
  }

  // Hex: 0x...
  if (/^0x[0-9a-f]+$/i.test(str)) {
    return parseInt(str.slice(2), 16);
  }

  // Hex with H suffix: e.g., 20H, 0FFH
  if (/^[0-9a-f]+h$/i.test(str)) {
    return parseInt(str.slice(0, -1), 16);
  }

  // Binary with B suffix: e.g., 0101b, 11110000B
  if (/^[01]+b$/i.test(str)) {
    return parseInt(str.slice(0, -1), 2);
  }

  // Decimal with D suffix: e.g., 25D
  if (/^[0-9]+d$/i.test(str)) {
    return parseInt(str.slice(0, -1), 10);
  }

  // Standard Decimal: e.g., 123
  if (/^-?[0-9]+$/.test(str)) {
    return parseInt(str, 10);
  }

  return null;
}

interface ParsedLine {
  lineNum: number;
  originalText: string;
  cleanedText: string;
  label?: string;
  mnemonic?: string;
  operands: string[];
  pc: number;
  byteLength: number;
  isDirective?: boolean;
}

/**
 * 2-Pass 8051 Assembler
 */
export class Assembler8051 {
  public assemble(source: string): AssemblyResult {
    const lines = source.split(/\r?\n/);
    const symbolTable = new Map<string, number>();
    const errors: AssemblyError[] = [];

    // Pre-populate with standard symbols
    for (const [name, addr] of Object.entries(STANDARD_SYMBOLS)) {
      symbolTable.set(name, addr);
    }

    // ==========================================
    // PASS 1: Labels, directives, symbol offsets
    // ==========================================
    let currentPC = 0x0000;
    let entryPC = 0x0000;
    let hasEntry = false;
    const parsedLines: ParsedLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i];

      // Strip comments (';')
      const commentIdx = rawLine.indexOf(';');
      const noComment = (commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine).trim();

      if (!noComment) {
        continue;
      }

      let lineText = noComment;
      let label: string | undefined = undefined;

      // Check for label definition "LABEL:"
      const labelMatch = lineText.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:(.*)$/);
      if (labelMatch) {
        label = labelMatch[1].toUpperCase();
        lineText = labelMatch[2].trim();

        if (symbolTable.has(label) && !STANDARD_SYMBOLS[label]) {
          errors.push({ line: lineNum, message: `Duplicate label definition: '${label}'` });
        } else {
          symbolTable.set(label, currentPC);
        }
      }

      // If line only had a label, continue
      if (!lineText) {
        parsedLines.push({
          lineNum,
          originalText: rawLine,
          cleanedText: noComment,
          label,
          operands: [],
          pc: currentPC,
          byteLength: 0,
        });
        continue;
      }

      // Tokenize mnemonic and operands
      const spaceIdx = lineText.search(/\s/);
      let mnemonic = '';
      let operandsStr = '';

      if (spaceIdx === -1) {
        mnemonic = lineText.toUpperCase();
      } else {
        mnemonic = lineText.slice(0, spaceIdx).toUpperCase();
        operandsStr = lineText.slice(spaceIdx).trim();
      }

      const operands = operandsStr ? operandsStr.split(',').map((s) => s.trim()) : [];

      // Check Directives: ORG, EQU, DB, END
      if (mnemonic === 'ORG') {
        const val = parseNumber(operands[0], symbolTable, currentPC);
        if (val === null) {
          errors.push({ line: lineNum, message: `Invalid ORG expression: '${operands[0]}'` });
        } else {
          currentPC = val & 0xffff;
          if (!hasEntry) {
            entryPC = currentPC;
            hasEntry = true;
          }
        }
        parsedLines.push({
          lineNum,
          originalText: rawLine,
          cleanedText: noComment,
          label,
          mnemonic,
          operands,
          pc: currentPC,
          byteLength: 0,
          isDirective: true,
        });
        continue;
      }

      if (mnemonic === 'EQU') {
        if (!label) {
          errors.push({ line: lineNum, message: 'EQU directive requires a label' });
        } else {
          const val = parseNumber(operands[0], symbolTable, currentPC);
          if (val === null) {
            errors.push({ line: lineNum, message: `Invalid EQU value: '${operands[0]}'` });
          } else {
            symbolTable.set(label, val);
          }
        }
        parsedLines.push({
          lineNum,
          originalText: rawLine,
          cleanedText: noComment,
          label,
          mnemonic,
          operands,
          pc: currentPC,
          byteLength: 0,
          isDirective: true,
        });
        continue;
      }

      if (mnemonic === 'END') {
        parsedLines.push({
          lineNum,
          originalText: rawLine,
          cleanedText: noComment,
          label,
          mnemonic,
          operands: [],
          pc: currentPC,
          byteLength: 0,
          isDirective: true,
        });
        break; // Stop parsing on END
      }

      if (mnemonic === 'DB') {
        const byteCount = operands.length;
        parsedLines.push({
          lineNum,
          originalText: rawLine,
          cleanedText: noComment,
          label,
          mnemonic,
          operands,
          pc: currentPC,
          byteLength: byteCount,
          isDirective: true,
        });
        currentPC = (currentPC + byteCount) & 0xffff;
        continue;
      }

      // Compute instruction byte length
      const length = this.getInstructionLength(mnemonic, operands);
      if (length === 0) {
        errors.push({ line: lineNum, message: `Unknown instruction or syntax: '${mnemonic} ${operands.join(', ')}'` });
      }

      parsedLines.push({
        lineNum,
        originalText: rawLine,
        cleanedText: noComment,
        label,
        mnemonic,
        operands,
        pc: currentPC,
        byteLength: length,
      });

      currentPC = (currentPC + length) & 0xffff;
    }

    // ==========================================
    // PASS 2: Emit Machine Code & Source Map
    // ==========================================
    const rom = new Uint8Array(65536);
    const sourceMap: SourceMapEntry[] = [];
    let maxPC = currentPC;

    for (const item of parsedLines) {
      if (!item.mnemonic || item.byteLength === 0) {
        continue;
      }

      // Record source map entry for executable lines
      if (!item.isDirective) {
        sourceMap.push({
          line: item.lineNum,
          pc: item.pc,
          source: item.cleanedText,
        });
      }

      if (item.mnemonic === 'DB') {
        for (let b = 0; b < item.operands.length; b++) {
          const val = parseNumber(item.operands[b], symbolTable, item.pc + b);
          rom[item.pc + b] = (val ?? 0) & 0xff;
        }
        continue;
      }

      try {
        const bytes = this.emitInstruction(item.mnemonic, item.operands, item.pc, symbolTable);
        for (let b = 0; b < bytes.length; b++) {
          rom[item.pc + b] = bytes[b] & 0xff;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ line: item.lineNum, message: msg });
      }
    }

    const code = rom.subarray(0, Math.max(maxPC, 1));

    return {
      code,
      byteCount: maxPC,
      entryPC,
      sourceMap,
      symbolTable,
      errors,
    };
  }

  /**
   * Determine instruction byte length (1, 2, or 3 bytes)
   */
  private getInstructionLength(mnemonic: string, ops: string[]): number {
    switch (mnemonic) {
      // 1-byte instructions
      case 'NOP':
      case 'RET':
      case 'RETI':
      case 'RL':
      case 'RLC':
      case 'RR':
      case 'RRC':
      case 'SWAP':
      case 'DA':
      case 'MUL':
      case 'DIV':
        return 1;

      case 'INC':
      case 'DEC': {
        const op = ops[0]?.toUpperCase();
        if (op === 'A' || op === 'DPTR' || this.isRegister(op) || this.isIndirect(op)) {
          return 1;
        }
        return 2; // direct
      }

      case 'CLR':
      case 'SETB':
      case 'CPL': {
        const op = ops[0]?.toUpperCase();
        if (op === 'A' || op === 'C') return 1;
        return 2; // bit
      }

      case 'SJMP':
      case 'AJMP':
      case 'ACALL':
      case 'JZ':
      case 'JNZ':
      case 'JC':
      case 'JNC':
        return 2;

      case 'LJMP':
      case 'LCALL':
        return 3;

      case 'DJNZ': {
        const op = ops[0]?.toUpperCase();
        if (this.isRegister(op)) return 2;
        return 3; // direct, rel
      }

      case 'CJNE':
        return 3;

      case 'JB':
      case 'JNB':
      case 'JBC':
        return 3;

      case 'PUSH':
      case 'POP':
        return 2;

      case 'XCH': {
        const op2 = ops[1]?.toUpperCase();
        if (this.isRegister(op2) || this.isIndirect(op2)) return 1;
        return 2; // direct
      }
      case 'XCHD':
        return 1;

      case 'ADD':
      case 'ADDC':
      case 'SUBB': {
        const op2 = ops[1]?.toUpperCase();
        if (this.isRegister(op2) || this.isIndirect(op2)) return 1;
        return 2; // #data or direct
      }

      case 'ANL':
      case 'ORL':
      case 'XRL': {
        const op1 = ops[0]?.toUpperCase();
        const op2 = ops[1]?.toUpperCase();
        if (op1 === 'C') return 2;
        if (op1 === 'A') {
          if (this.isRegister(op2) || this.isIndirect(op2)) return 1;
          return 2; // direct or #data
        }
        // direct, A or direct, #data
        if (op2?.startsWith('#')) return 3;
        return 2;
      }

      case 'MOV': {
        const dest = ops[0]?.toUpperCase();
        const src = ops[1]?.toUpperCase();

        if (dest === 'DPTR') return 3; // MOV DPTR, #data16
        if (dest === 'C' || src === 'C') return 2; // MOV C, bit or MOV bit, C

        if (dest === 'A') {
          if (this.isRegister(src) || this.isIndirect(src)) return 1;
          return 2; // #data or direct
        }

        if (this.isRegister(dest)) {
          if (src === 'A') return 1;
          return 2; // #data or direct
        }

        if (this.isIndirect(dest)) {
          if (src === 'A') return 1;
          return 2; // #data or direct
        }

        // dest is direct
        if (src === 'A' || this.isRegister(src) || this.isIndirect(src)) {
          return 2;
        }
        return 3; // direct, #data or direct, direct
      }

      default:
        return 0;
    }
  }

  /**
   * Emits machine code bytes for an instruction in Pass 2
   */
  private emitInstruction(
    mnemonic: string,
    ops: string[],
    pc: number,
    symbols: Map<string, number>
  ): number[] {
    const op1 = ops[0];
    const op2 = ops[1];
    const op3 = ops[2];

    const u1 = op1?.toUpperCase();
    const u2 = op2?.toUpperCase();
    const u3 = op3?.toUpperCase();

    // Helper for relative branch offset
    const relOffset = (targetStr: string, instrLen: number): number => {
      const target = parseNumber(targetStr, symbols, pc);
      if (target === null) {
        throw new Error(`Unknown label/symbol for branch target: '${targetStr}'`);
      }
      const nextPC = (pc + instrLen) & 0xffff;
      const diff = target - nextPC;
      if (diff < -128 || diff > 127) {
        throw new Error(`Branch target '${targetStr}' (0x${target.toString(16)}) out of range for relative jump (offset ${diff})`);
      }
      return diff >= 0 ? diff : 256 + diff;
    };

    // Helper for direct address resolution
    const resolveDirect = (str: string): number => {
      const val = parseNumber(str, symbols, pc);
      if (val === null) {
        throw new Error(`Unknown direct address/symbol: '${str}'`);
      }
      return val & 0xff;
    };

    // Helper for immediate 8-bit resolution
    const resolveImm8 = (str: string): number => {
      const val = parseNumber(str, symbols, pc);
      if (val === null) {
        throw new Error(`Invalid immediate value: '${str}'`);
      }
      return val & 0xff;
    };

    // Helper for immediate 16-bit resolution
    const resolveImm16 = (str: string): number => {
      const val = parseNumber(str, symbols, pc);
      if (val === null) {
        throw new Error(`Invalid 16-bit address/immediate: '${str}'`);
      }
      return val & 0xffff;
    };

    switch (mnemonic) {
      case 'NOP':
        return [0x00];
      case 'RET':
        return [0x22];
      case 'RETI':
        return [0x32];
      case 'RL':
        return [0x23];
      case 'RLC':
        return [0x33];
      case 'RR':
        return [0x03];
      case 'RRC':
        return [0x13];
      case 'SWAP':
        return [0xc4];
      case 'DA':
        return [0xd4];
      case 'MUL':
        return [0xa4];
      case 'DIV':
        return [0x84];

      case 'LJMP': {
        const addr = resolveImm16(op1);
        return [0x02, (addr >> 8) & 0xff, addr & 0xff];
      }
      case 'AJMP': {
        const addr = resolveImm16(op1);
        const page = (addr >> 8) & 0x07;
        return [0x01 | (page << 5), addr & 0xff];
      }
      case 'SJMP': {
        return [0x80, relOffset(op1, 2)];
      }

      case 'LCALL': {
        const addr = resolveImm16(op1);
        return [0x12, (addr >> 8) & 0xff, addr & 0xff];
      }
      case 'ACALL': {
        const addr = resolveImm16(op1);
        const page = (addr >> 8) & 0x07;
        return [0x11 | (page << 5), addr & 0xff];
      }

      case 'JZ':
        return [0x60, relOffset(op1, 2)];
      case 'JNZ':
        return [0x70, relOffset(op1, 2)];
      case 'JC':
        return [0x40, relOffset(op1, 2)];
      case 'JNC':
        return [0x50, relOffset(op1, 2)];

      case 'JB': {
        const bit = resolveDirect(op1);
        return [0x20, bit, relOffset(op2, 3)];
      }
      case 'JNB': {
        const bit = resolveDirect(op1);
        return [0x30, bit, relOffset(op2, 3)];
      }
      case 'JBC': {
        const bit = resolveDirect(op1);
        return [0x10, bit, relOffset(op2, 3)];
      }

      case 'DJNZ': {
        if (this.isRegister(u1)) {
          const r = this.getRegNumber(u1);
          return [0xd8 + r, relOffset(op2, 2)];
        }
        const dir = resolveDirect(op1);
        return [0xd5, dir, relOffset(op2, 3)];
      }

      case 'CJNE': {
        if (u1 === 'A') {
          if (u2.startsWith('#')) {
            return [0xb4, resolveImm8(op2), relOffset(op3, 3)];
          }
          return [0xb5, resolveDirect(op2), relOffset(op3, 3)];
        }
        if (this.isRegister(u1)) {
          const r = this.getRegNumber(u1);
          return [0xb8 + r, resolveImm8(op2), relOffset(op3, 3)];
        }
        if (this.isIndirect(u1)) {
          const ri = this.getIndirectNumber(u1);
          return [0xb6 + ri, resolveImm8(op2), relOffset(op3, 3)];
        }
        throw new Error(`Unsupported CJNE operands: ${op1}, ${op2}`);
      }

      case 'PUSH':
        return [0xc0, resolveDirect(op1)];
      case 'POP':
        return [0xd0, resolveDirect(op1)];

      case 'CLR': {
        if (u1 === 'A') return [0xe4];
        if (u1 === 'C') return [0xc3];
        return [0xc2, resolveDirect(op1)];
      }
      case 'SETB': {
        if (u1 === 'C') return [0xd3];
        return [0xd2, resolveDirect(op1)];
      }
      case 'CPL': {
        if (u1 === 'A') return [0xf4];
        if (u1 === 'C') return [0xb3];
        return [0xb2, resolveDirect(op1)];
      }

      case 'INC': {
        if (u1 === 'A') return [0x04];
        if (u1 === 'DPTR') return [0xa3];
        if (this.isRegister(u1)) return [0x08 + this.getRegNumber(u1)];
        if (this.isIndirect(u1)) return [0x06 + this.getIndirectNumber(u1)];
        return [0x05, resolveDirect(op1)];
      }
      case 'DEC': {
        if (u1 === 'A') return [0x14];
        if (this.isRegister(u1)) return [0x18 + this.getRegNumber(u1)];
        if (this.isIndirect(u1)) return [0x16 + this.getIndirectNumber(u1)];
        return [0x15, resolveDirect(op1)];
      }

      case 'ADD': {
        if (u1 !== 'A') throw new Error("Destination for ADD must be 'A'");
        if (u2.startsWith('#')) return [0x24, resolveImm8(op2)];
        if (this.isRegister(u2)) return [0x28 + this.getRegNumber(u2)];
        if (this.isIndirect(u2)) return [0x26 + this.getIndirectNumber(u2)];
        return [0x25, resolveDirect(op2)];
      }
      case 'ADDC': {
        if (u1 !== 'A') throw new Error("Destination for ADDC must be 'A'");
        if (u2.startsWith('#')) return [0x34, resolveImm8(op2)];
        if (this.isRegister(u2)) return [0x38 + this.getRegNumber(u2)];
        if (this.isIndirect(u2)) return [0x36 + this.getIndirectNumber(u2)];
        return [0x35, resolveDirect(op2)];
      }
      case 'SUBB': {
        if (u1 !== 'A') throw new Error("Destination for SUBB must be 'A'");
        if (u2.startsWith('#')) return [0x94, resolveImm8(op2)];
        if (this.isRegister(u2)) return [0x98 + this.getRegNumber(u2)];
        if (this.isIndirect(u2)) return [0x96 + this.getIndirectNumber(u2)];
        return [0x95, resolveDirect(op2)];
      }

      case 'ANL': {
        if (u1 === 'C') {
          if (u2.startsWith('/')) {
            return [0xb0, resolveDirect(op2.slice(1))];
          }
          return [0x82, resolveDirect(op2)];
        }
        if (u1 === 'A') {
          if (u2.startsWith('#')) return [0x54, resolveImm8(op2)];
          if (this.isRegister(u2)) return [0x58 + this.getRegNumber(u2)];
          if (this.isIndirect(u2)) return [0x56 + this.getIndirectNumber(u2)];
          return [0x55, resolveDirect(op2)];
        }
        // ANL direct, A or ANL direct, #data
        if (u2 === 'A') return [0x52, resolveDirect(op1)];
        if (u2.startsWith('#')) return [0x53, resolveDirect(op1), resolveImm8(op2)];
        throw new Error(`Unsupported ANL syntax: ${op1}, ${op2}`);
      }

      case 'ORL': {
        if (u1 === 'C') {
          if (u2.startsWith('/')) {
            return [0xa0, resolveDirect(op2.slice(1))];
          }
          return [0x72, resolveDirect(op2)];
        }
        if (u1 === 'A') {
          if (u2.startsWith('#')) return [0x44, resolveImm8(op2)];
          if (this.isRegister(u2)) return [0x48 + this.getRegNumber(u2)];
          if (this.isIndirect(u2)) return [0x46 + this.getIndirectNumber(u2)];
          return [0x45, resolveDirect(op2)];
        }
        if (u2 === 'A') return [0x42, resolveDirect(op1)];
        if (u2.startsWith('#')) return [0x43, resolveDirect(op1), resolveImm8(op2)];
        throw new Error(`Unsupported ORL syntax: ${op1}, ${op2}`);
      }

      case 'XRL': {
        if (u1 === 'A') {
          if (u2.startsWith('#')) return [0x64, resolveImm8(op2)];
          if (this.isRegister(u2)) return [0x68 + this.getRegNumber(u2)];
          if (this.isIndirect(u2)) return [0x66 + this.getIndirectNumber(u2)];
          return [0x65, resolveDirect(op2)];
        }
        if (u2 === 'A') return [0x62, resolveDirect(op1)];
        if (u2.startsWith('#')) return [0x63, resolveDirect(op1), resolveImm8(op2)];
        throw new Error(`Unsupported XRL syntax: ${op1}, ${op2}`);
      }

      case 'XCH': {
        if (u1 !== 'A') throw new Error("Destination for XCH must be 'A'");
        if (this.isRegister(u2)) return [0xc8 + this.getRegNumber(u2)];
        if (this.isIndirect(u2)) return [0xc6 + this.getIndirectNumber(u2)];
        return [0xc5, resolveDirect(op2)];
      }
      case 'XCHD': {
        if (u1 !== 'A') throw new Error("Destination for XCHD must be 'A'");
        if (this.isIndirect(u2)) return [0xd6 + this.getIndirectNumber(u2)];
        throw new Error("XCHD only supports operand @R0 or @R1");
      }

      case 'MOV': {
        // MOV DPTR, #data16
        if (u1 === 'DPTR') {
          const val = resolveImm16(op2);
          return [0x90, (val >> 8) & 0xff, val & 0xff];
        }

        // MOV C, bit
        if (u1 === 'C') {
          return [0xa2, resolveDirect(op2)];
        }
        // MOV bit, C
        if (u2 === 'C') {
          return [0x92, resolveDirect(op1)];
        }

        // MOV A, ...
        if (u1 === 'A') {
          if (u2.startsWith('#')) return [0x74, resolveImm8(op2)];
          if (this.isRegister(u2)) return [0xe8 + this.getRegNumber(u2)];
          if (this.isIndirect(u2)) return [0xe6 + this.getIndirectNumber(u2)];
          return [0xe5, resolveDirect(op2)];
        }

        // MOV Rn, ...
        if (this.isRegister(u1)) {
          const r = this.getRegNumber(u1);
          if (u2 === 'A') return [0xf8 + r];
          if (u2.startsWith('#')) return [0x78 + r, resolveImm8(op2)];
          return [0xa8 + r, resolveDirect(op2)];
        }

        // MOV @Ri, ...
        if (this.isIndirect(u1)) {
          const ri = this.getIndirectNumber(u1);
          if (u2 === 'A') return [0xf6 + ri];
          if (u2.startsWith('#')) return [0x76 + ri, resolveImm8(op2)];
          return [0xa6 + ri, resolveDirect(op2)];
        }

        // Destination is direct: MOV direct, ...
        const destDir = resolveDirect(op1);
        if (u2 === 'A') return [0xf5, destDir];
        if (this.isRegister(u2)) return [0x88 + this.getRegNumber(u2), destDir];
        if (this.isIndirect(u2)) return [0x86 + this.getIndirectNumber(u2), destDir];
        if (u2.startsWith('#')) return [0x75, destDir, resolveImm8(op2)];

        // MOV direct, direct -> In 8051 machine code: 0x85 src dest
        const srcDir = resolveDirect(op2);
        return [0x85, srcDir, destDir];
      }

      default:
        throw new Error(`Unimplemented mnemonic: ${mnemonic}`);
    }
  }

  private isRegister(op?: string): boolean {
    return /^R[0-7]$/i.test(op ?? '');
  }

  private getRegNumber(op: string): number {
    return parseInt(op.slice(1), 10) & 7;
  }

  private isIndirect(op?: string): boolean {
    return /^@R[0-1]$/i.test(op ?? '');
  }

  private getIndirectNumber(op: string): number {
    return parseInt(op.slice(2), 10) & 1;
  }
}

/**
 * Convenience helper to assemble 8051 assembly source code.
 */
export function assemble(source: string): AssemblyResult {
  const assembler = new Assembler8051();
  return assembler.assemble(source);
}
