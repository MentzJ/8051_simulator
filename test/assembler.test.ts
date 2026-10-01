import { describe, it, expect } from 'vitest';
import { assemble, CPU8051, parseNumber } from '../src/index.js';

describe('8051 2-Pass Assembler', () => {
  describe('Literal parsing (Hex, Dec, Bin, Chars, Symbols)', () => {
    it('parses various numeric formats accurately', () => {
      expect(parseNumber('20H')).toBe(0x20);
      expect(parseNumber('0FFH')).toBe(0xff);
      expect(parseNumber('0x1234')).toBe(0x1234);
      expect(parseNumber('1010b')).toBe(10);
      expect(parseNumber('100')).toBe(100);
      expect(parseNumber('#25H')).toBe(0x25);
      expect(parseNumber("'A'")).toBe(65);
    });

    it('resolves bit addressing dot notation', () => {
      expect(parseNumber('PSW.7')).toBe(0xd7); // CY bit
      expect(parseNumber('PSW.0')).toBe(0xd0); // P bit
      expect(parseNumber('20H.0')).toBe(0x00); // lower RAM bit 0
      expect(parseNumber('20H.7')).toBe(0x07); // lower RAM bit 7
      expect(parseNumber('21H.0')).toBe(0x08);
    });
  });

  describe('Pass 1: Comment stripping, labels & symbol table', () => {
    it('strips comments and extracts labels with correct 16-bit ROM offsets', () => {
      const src = `
        ; Initial comments
        ORG 0000H
        START:  MOV A, #20H     ; Load 0x20 into A (2 bytes, pc=0)
                MOV R0, #05H    ; 2 bytes, pc=2
        LOOP:   INC A           ; 1 byte, pc=4
                DJNZ R0, LOOP   ; 2 bytes, pc=5
        DONE:   SJMP DONE       ; 2 bytes, pc=7
      `;

      const result = assemble(src);
      expect(result.errors).toHaveLength(0);
      expect(result.symbolTable.get('START')).toBe(0x0000);
      expect(result.symbolTable.get('LOOP')).toBe(0x0004);
      expect(result.symbolTable.get('DONE')).toBe(0x0007);
    });

    it('supports standalone label lines', () => {
      const src = `
        ORG 0100H
        MYLABEL:
            NOP
      `;
      const result = assemble(src);
      expect(result.errors).toHaveLength(0);
      expect(result.symbolTable.get('MYLABEL')).toBe(0x0100);
      expect(result.code[0x0100]).toBe(0x00); // NOP
    });
  });

  describe('Pass 2: Machine code emission & source mapping', () => {
    it('emits Uint8Array and source map entries { line, pc }', () => {
      const src = [
        'ORG 0000H',           // line 1
        'MOV A, #20H',         // line 2 -> pc 0
        'LOOP:',               // line 3
        'INC A',               // line 4 -> pc 2
        'SJMP LOOP',           // line 5 -> pc 3
      ].join('\n');

      const result = assemble(src);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toBeInstanceOf(Uint8Array);

      // Verify machine code bytes
      // MOV A, #20H is 0x74 0x20
      expect(result.code[0]).toBe(0x74);
      expect(result.code[1]).toBe(0x20);

      // INC A is 0x04
      expect(result.code[2]).toBe(0x04);

      // SJMP LOOP is 0x80 rel (-3 = 0xFD)
      expect(result.code[3]).toBe(0x80);
      expect(result.code[4]).toBe(0xfd);

      // Verify source map has line numbers and PC
      const linesMapped = result.sourceMap.map((sm) => ({ line: sm.line, pc: sm.pc }));
      expect(linesMapped).toEqual([
        { line: 2, pc: 0 },
        { line: 4, pc: 2 },
        { line: 5, pc: 3 },
      ]);
    });
  });

  describe('Execution on CPU8051: Increment/Loop demo', () => {
    it('assembles and executes loop demo on CPU8051', () => {
      const src = `
        ORG 0000H
        MOV R0, #05H       ; Loop counter = 5
        MOV A, #00H        ; Clear accumulator
      LOOP:
        INC A              ; A = A + 1
        DJNZ R0, LOOP      ; Loop 5 times
        MOV 30H, A         ; Save result to RAM 0x30
        NOP
      `;

      const result = assemble(src);
      expect(result.errors).toHaveLength(0);

      const cpu = new CPU8051();
      cpu.loadProgram(result.code);

      // Run until NOP
      let steps = 0;
      while (cpu.pc < result.byteCount && steps < 100) {
        cpu.step();
        steps++;
      }

      // Check results
      expect(cpu.acc).toBe(5);
      expect(cpu.getRegister(0)).toBe(0);
      expect(cpu.ram[0x30]).toBe(5);
    });

    it('correctly assembles bit operations and flag manipulations', () => {
      const src = `
        ORG 0000H
        SETB C
        CLR C
        SETB PSW.7
        CPL C
        NOP
      `;
      const result = assemble(src);
      expect(result.errors).toHaveLength(0);

      const cpu = new CPU8051();
      cpu.loadProgram(result.code);

      cpu.step(); // SETB C
      expect(cpu.getFlag(0x80)).toBe(true);

      cpu.step(); // CLR C
      expect(cpu.getFlag(0x80)).toBe(false);

      cpu.step(); // SETB PSW.7
      expect(cpu.getFlag(0x80)).toBe(true);

      cpu.step(); // CPL C
      expect(cpu.getFlag(0x80)).toBe(false);
    });

    it('reports error for out-of-range relative jump', () => {
      const src = `
        ORG 0000H
        SJMP FAR_AWAY
        ORG 0500H
        FAR_AWAY: NOP
      `;
      const result = assemble(src);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('out of range');
    });

    it('assembles DPTR, direct-to-direct MOV, and CJNE correctly', () => {
      const src = `
        ORG 0000H
        MOV DPTR, #1234H     ; 90 12 34
        MOV 30H, #55H        ; 75 30 55
        MOV 40H, 30H         ; 85 30 40
        CJNE A, #00H, SKIP   ; B4 00 01 (rel = 1 to skip INC)
        INC A                ; 04
      SKIP:
        NOP                  ; 00
      `;
      const result = assemble(src);
      expect(result.errors).toHaveLength(0);
      expect(result.code[0]).toBe(0x90);
      expect(result.code[1]).toBe(0x12);
      expect(result.code[2]).toBe(0x34);

      // MOV 30H, #55H
      expect(result.code[3]).toBe(0x75);
      expect(result.code[4]).toBe(0x30);
      expect(result.code[5]).toBe(0x55);

      // MOV direct, direct: 85 src dest
      expect(result.code[6]).toBe(0x85);
      expect(result.code[7]).toBe(0x30);
      expect(result.code[8]).toBe(0x40);

      // CJNE A, #00H, SKIP
      expect(result.code[9]).toBe(0xb4);
      expect(result.code[10]).toBe(0x00);

      const cpu = new CPU8051();
      cpu.loadProgram(result.code);
      cpu.step(); // MOV DPTR
      expect(cpu.dptr).toBe(0x1234);
      cpu.step(); // MOV 30H, #55H
      expect(cpu.ram[0x30]).toBe(0x55);
      cpu.step(); // MOV 40H, 30H
      expect(cpu.ram[0x40]).toBe(0x55);
    });
  });
});

