import { describe, it, expect, beforeEach } from 'vitest';
import { CPU8051, assemble, type CpuStateSnapshot } from '../src/index.js';

describe('CPU Worker Pipeline Protocol & Batch Processing', () => {
  let cpu: CPU8051;

  beforeEach(() => {
    cpu = new CPU8051();
  });

  it('runs batch execution loops and halts accurately on SJMP $', () => {
    const src = `
      ORG 0000H
      MOV R0, #10H        ; 16 iterations
    LOOP:
      INC A
      DJNZ R0, LOOP
    HALT:
      SJMP HALT           ; Infinite self-jump
    `;

    const res = assemble(src);
    expect(res.errors).toHaveLength(0);
    cpu.loadProgram(res.code);

    let isHalted = false;
    let cyclesExecuted = 0;
    const maxCycles = 10000;

    while (cyclesExecuted < maxCycles && !isHalted) {
      const op = cpu.rom[cpu.pc];
      const nxt = cpu.rom[(cpu.pc + 1) & 0xffff];
      if (op === 0x80 && nxt === 0xfe) {
        isHalted = true;
        break;
      }
      const stepRes = cpu.step();
      cyclesExecuted += stepRes.cycles;
    }

    expect(isHalted).toBe(true);
    expect(cpu.acc).toBe(16);
    expect(cpu.getRegister(0)).toBe(0);
  });

  it('collects differential RAM and XRAM updates for UI throttling', () => {
    const src = `
      ORG 0000H
      MOV 30H, #0AAH      ; Internal RAM 0x30 = 0xAA
      MOV DPTR, #2000H    ; XRAM target 0x2000
      MOV A, #055H
      MOVX @DPTR, A       ; XRAM 0x2000 = 0x55
      SJMP $
    `;

    const res = assemble(src);
    expect(res.errors).toHaveLength(0);
    cpu.loadProgram(res.code);

    // Initial state snapshot
    const prevRam = new Uint8Array(128);
    cpu.clearDirtyXram();

    // Execute MOV 30H, #0AAH (2 cycles)
    cpu.step();

    // Collect dirty RAM
    const dirtyRam: { address: number; value: number }[] = [];
    for (let i = 0; i < 128; i++) {
      if (cpu.ram[i] !== prevRam[i]) {
        dirtyRam.push({ address: i, value: cpu.ram[i] });
        prevRam[i] = cpu.ram[i];
      }
    }
    expect(dirtyRam).toEqual([{ address: 0x30, value: 0xAA }]);

    // Execute MOV DPTR, #2000H & MOV A, #055H & MOVX @DPTR, A
    cpu.step(); // MOV DPTR
    cpu.step(); // MOV A
    cpu.step(); // MOVX @DPTR, A

    const dirtyXram = Array.from(cpu.dirtyXram).map((addr) => ({
      address: addr,
      value: cpu.xram[addr],
    }));
    cpu.clearDirtyXram();

    expect(dirtyXram).toEqual([{ address: 0x2000, value: 0x55 }]);
    expect(cpu.dirtyXram.size).toBe(0);
  });

  it('serves 256-byte chunk requests for lazy 64KB XRAM inspection', () => {
    // Populate some sparse data in XRAM
    cpu.writeXRAM(0x2000, 0x11);
    cpu.writeXRAM(0x2005, 0x22);
    cpu.writeXRAM(0x20FE, 0x33);

    // Request chunk at 0x2000 of length 256
    const offset = 0x2000;
    const chunk = Array.from(cpu.xram.subarray(offset, offset + 256));

    expect(chunk.length).toBe(256);
    expect(chunk[0x00]).toBe(0x11);
    expect(chunk[0x05]).toBe(0x22);
    expect(chunk[0xFE]).toBe(0x33);
    expect(chunk[0x01]).toBe(0x00);
  });
});
