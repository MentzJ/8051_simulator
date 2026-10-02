import { describe, it, expect, beforeEach } from 'vitest';
import { CPU8051, assemble, SFR } from '../src/index.js';

describe('64KB External RAM (XRAM) & MOVX', () => {
  let cpu: CPU8051;

  beforeEach(() => {
    cpu = new CPU8051();
  });

  it('initializes 64KB XRAM array to zeros', () => {
    expect(cpu.xram).toBeInstanceOf(Uint8Array);
    expect(cpu.xram.length).toBe(65536);
    expect(cpu.readXRAM(0x0000)).toBe(0);
    expect(cpu.readXRAM(0x2000)).toBe(0);
    expect(cpu.readXRAM(0xFFFF)).toBe(0);
  });

  it('writes and reads XRAM directly and tracks dirty addresses', () => {
    expect(cpu.dirtyXram.size).toBe(0);

    cpu.writeXRAM(0x1234, 0xAB);
    expect(cpu.readXRAM(0x1234)).toBe(0xAB);
    expect(cpu.dirtyXram.has(0x1234)).toBe(true);

    cpu.clearDirtyXram();
    expect(cpu.dirtyXram.size).toBe(0);
  });

  it('assembles and executes MOVX @DPTR, A and MOVX A, @DPTR', () => {
    const src = `
      ORG 0000H
      MOV DPTR, #2000H    ; DPTR = 0x2000
      MOV A, #5AH         ; A = 0x5A
      MOVX @DPTR, A       ; Write A to XRAM[0x2000]

      MOV A, #00H         ; Clear A
      MOV DPTR, #2000H
      MOVX A, @DPTR       ; Read XRAM[0x2000] back into A
      SJMP $
    `;

    const res = assemble(src);
    expect(res.errors).toHaveLength(0);
    cpu.loadProgram(res.code);

    // Step MOV DPTR, #2000H
    cpu.step();
    expect(cpu.dptr).toBe(0x2000);

    // Step MOV A, #5AH
    cpu.step();
    expect(cpu.acc).toBe(0x5A);

    // Step MOVX @DPTR, A
    const writeCycles = cpu.step();
    expect(writeCycles.cycles).toBe(2);
    expect(cpu.readXRAM(0x2000)).toBe(0x5A);
    expect(cpu.dirtyXram.has(0x2000)).toBe(true);

    // Step MOV A, #00H
    cpu.step();
    expect(cpu.acc).toBe(0x00);

    // Step MOV DPTR, #2000H
    cpu.step();

    // Step MOVX A, @DPTR
    const readCycles = cpu.step();
    expect(readCycles.cycles).toBe(2);
    expect(cpu.acc).toBe(0x5A);
  });

  it('assembles and executes 8-bit page access MOVX @Ri, A and MOVX A, @Ri', () => {
    const src = `
      ORG 0000H
      MOV P2, #40H        ; High byte of address = 0x40
      MOV R0, #25H        ; Low byte of address = 0x25 -> target 0x4025
      MOV A, #0EEH
      MOVX @R0, A         ; Write 0xEE to XRAM[0x4025]

      MOV A, #00H
      MOVX A, @R0         ; Read back into A
      SJMP $
    `;

    const res = assemble(src);
    expect(res.errors).toHaveLength(0);
    cpu.loadProgram(res.code);

    cpu.step(); // MOV P2, #40H
    cpu.step(); // MOV R0, #25H
    cpu.step(); // MOV A, #0EEH
    cpu.step(); // MOVX @R0, A

    expect(cpu.readXRAM(0x4025)).toBe(0xEE);

    cpu.step(); // MOV A, #00H
    expect(cpu.acc).toBe(0);

    cpu.step(); // MOVX A, @R0
    expect(cpu.acc).toBe(0xEE);
  });
});
