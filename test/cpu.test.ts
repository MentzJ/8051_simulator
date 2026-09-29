import { describe, it, expect, beforeEach } from 'vitest';
import { CPU8051, SFR, PSW_MASK, computeParity } from '../src/index.js';

describe('8051 CPU Core Simulator', () => {
  let cpu: CPU8051;

  beforeEach(() => {
    cpu = new CPU8051();
  });

  describe('CPU Architecture & Initial State', () => {
    it('initializes internal RAM (256 bytes) and SFR (128 bytes)', () => {
      expect(cpu.ram).toBeInstanceOf(Uint8Array);
      expect(cpu.ram.length).toBe(256);
      expect(cpu.sfr).toBeInstanceOf(Uint8Array);
      expect(cpu.sfr.length).toBe(128);
    });

    it('initializes PC to 0x0000 and SP to 0x07', () => {
      expect(cpu.pc).toBe(0x0000);
      expect(cpu.sp).toBe(0x07);
      expect(cpu.getSFR(SFR.SP)).toBe(0x07);
    });

    it('provides dedicated getters and setters for SFR addresses (ACC, B, PSW, DPL, DPH)', () => {
      // ACC (0xE0)
      cpu.setSFR(SFR.ACC, 0x42);
      expect(cpu.getSFR(SFR.ACC)).toBe(0x42);
      expect(cpu.acc).toBe(0x42);
      expect(cpu.a).toBe(0x42);

      // B (0xF0)
      cpu.setSFR(SFR.B, 0x99);
      expect(cpu.getSFR(SFR.B)).toBe(0x99);
      expect(cpu.b).toBe(0x99);

      // DPL (0x82) & DPH (0x83)
      cpu.setSFR(SFR.DPL, 0x34);
      cpu.setSFR(SFR.DPH, 0x12);
      expect(cpu.getSFR(SFR.DPL)).toBe(0x34);
      expect(cpu.getSFR(SFR.DPH)).toBe(0x12);
      expect(cpu.dptr).toBe(0x1234);

      // DPTR setter
      cpu.dptr = 0xABCD;
      expect(cpu.dph).toBe(0xAB);
      expect(cpu.dpl).toBe(0xCD);
      expect(cpu.getSFR(SFR.DPH)).toBe(0xAB);
      expect(cpu.getSFR(SFR.DPL)).toBe(0xCD);

      // PSW (0xD0)
      cpu.setSFR(SFR.PSW, 0x00);
      expect(cpu.getSFR(SFR.PSW)).toBe(cpu.psw);
    });

    it('throws error when accessing SFR address outside 0x80 - 0xFF', () => {
      expect(() => cpu.getSFR(0x7F)).toThrow();
      expect(() => cpu.setSFR(0x7F, 0x10)).toThrow();
    });
  });

  describe('PSW Flag Calculations & Parity', () => {
    it('ACC parity calculation is accurate for odd parity definition', () => {
      // 0 set bits -> even -> P = 0
      expect(computeParity(0x00)).toBe(0);
      // 1 set bit -> odd -> P = 1
      expect(computeParity(0x01)).toBe(1);
      expect(computeParity(0x80)).toBe(1);
      // 2 set bits -> even -> P = 0
      expect(computeParity(0x03)).toBe(0);
      // 3 set bits -> odd -> P = 1
      expect(computeParity(0x07)).toBe(1);
      // 4 set bits -> even -> P = 0
      expect(computeParity(0x0F)).toBe(0);
      // 7 set bits -> odd -> P = 1
      expect(computeParity(0x7F)).toBe(1);
      // 8 set bits -> even -> P = 0
      expect(computeParity(0xFF)).toBe(0);
    });

    it('ACC parity updates automatically after every math and register op', () => {
      // Initial A is 0 -> 0 ones (even) -> P = 0
      expect(cpu.getFlag(PSW_MASK.P)).toBe(false);

      // Load program sequence:
      // 1. MOV A, #0x01 (0x74 0x01)
      // 2. ADD A, #0x02 (0x24 0x02)
      // 3. INC A        (0x04)
      // 4. SUBB A, #0x01(0x94 0x01)
      // 5. DEC A        (0x14)
      cpu.loadProgram([0x74, 0x01, 0x24, 0x02, 0x04, 0x94, 0x01, 0x14]);

      // Step 1: MOV A, #0x01 -> 1 one (odd) -> P = 1
      cpu.step();
      expect(cpu.acc).toBe(0x01);
      expect(cpu.getFlag(PSW_MASK.P)).toBe(true);
      expect(cpu.psw & PSW_MASK.P).toBe(1);

      // Step 2: ADD A, #0x02 -> A becomes 0x03 (2 ones, even) -> P = 0
      cpu.step();
      expect(cpu.acc).toBe(0x03);
      expect(cpu.getFlag(PSW_MASK.P)).toBe(false);

      // Step 3: INC A -> A becomes 0x04 (1 one, odd) -> P = 1
      cpu.step();
      expect(cpu.acc).toBe(0x04);
      expect(cpu.getFlag(PSW_MASK.P)).toBe(true);

      // Step 4: SUBB A, #0x01 (with CY=0) -> A becomes 0x03 (2 ones, even) -> P = 0
      cpu.step();
      expect(cpu.acc).toBe(0x03);
      expect(cpu.getFlag(PSW_MASK.P)).toBe(false);

      // Step 5: DEC A -> A becomes 0x02 (1 one, odd) -> P = 1
      cpu.step();
      expect(cpu.acc).toBe(0x02);
      expect(cpu.getFlag(PSW_MASK.P)).toBe(true);
    });

    it('sets Signed Overflow (OV) on 0x7F + 0x01', () => {
      // 0x7F (+127) + 0x01 (+1) = 0x80 (-128) -> Overflow occurs
      cpu.acc = 0x7F;
      cpu.loadProgram([0x24, 0x01]); // ADD A, #0x01
      const { cycles } = cpu.step();

      expect(cycles).toBe(1);
      expect(cpu.acc).toBe(0x80);
      expect(cpu.getFlag(PSW_MASK.OV)).toBe(true);
      expect(cpu.getFlag(PSW_MASK.AC)).toBe(true); // Carry from bit 3 (0x0F + 0x01 = 0x10)
      expect(cpu.getFlag(PSW_MASK.CY)).toBe(false); // No carry out of bit 7
      expect(cpu.getFlag(PSW_MASK.P)).toBe(true);  // 0x80 has 1 set bit (odd)
    });

    it('sets Auxiliary Carry (AC) and clears Carry (CY) on 0x0F + 0x01', () => {
      // 0x0F + 0x01 = 0x10 -> AC set, CY cleared
      cpu.acc = 0x0F;
      cpu.loadProgram([0x24, 0x01]); // ADD A, #0x01
      cpu.step();

      expect(cpu.acc).toBe(0x10);
      expect(cpu.getFlag(PSW_MASK.AC)).toBe(true);
      expect(cpu.getFlag(PSW_MASK.CY)).toBe(false);
      expect(cpu.getFlag(PSW_MASK.OV)).toBe(false);
      expect(cpu.getFlag(PSW_MASK.P)).toBe(true); // 0x10 has 1 set bit (odd)
    });

    it('sets both Carry (CY) and Auxiliary Carry (AC) on 0xFF + 0x01', () => {
      cpu.acc = 0xFF;
      cpu.loadProgram([0x24, 0x01]); // ADD A, #0x01
      cpu.step();

      expect(cpu.acc).toBe(0x00);
      expect(cpu.getFlag(PSW_MASK.CY)).toBe(true);
      expect(cpu.getFlag(PSW_MASK.AC)).toBe(true);
      expect(cpu.getFlag(PSW_MASK.OV)).toBe(false);
      expect(cpu.getFlag(PSW_MASK.P)).toBe(false); // 0 set bits (even)
    });

    it('handles SUBB flags accurately (CY, AC, OV)', () => {
      // 0x80 (-128) - 0x01 (+1) with CY=0 -> 0x7F (+127) -> Signed underflow (OV=1)
      cpu.acc = 0x80;
      cpu.setFlag(PSW_MASK.CY, false);
      cpu.loadProgram([0x94, 0x01]); // SUBB A, #0x01
      cpu.step();

      expect(cpu.acc).toBe(0x7F);
      expect(cpu.getFlag(PSW_MASK.OV)).toBe(true);
      expect(cpu.getFlag(PSW_MASK.AC)).toBe(true);
      expect(cpu.getFlag(PSW_MASK.CY)).toBe(false);

      // 0x00 - 0x01 -> 0xFF with borrow (CY=1, AC=1, OV=0)
      cpu.pc = 0;
      cpu.acc = 0x00;
      cpu.setFlag(PSW_MASK.CY, false);
      cpu.loadProgram([0x94, 0x01]); // SUBB A, #0x01
      cpu.step();

      expect(cpu.acc).toBe(0xFF);
      expect(cpu.getFlag(PSW_MASK.CY)).toBe(true);
      expect(cpu.getFlag(PSW_MASK.AC)).toBe(true);
      expect(cpu.getFlag(PSW_MASK.OV)).toBe(false);
    });
  });

  describe('Register Bank Switching via PSW bits RS0 / RS1', () => {
    it('switches between Bank 0 (0x00-0x07), Bank 1 (0x08-0x0F), Bank 2 (0x10-0x17), and Bank 3 (0x18-0x1F)', () => {
      // 1. In Bank 0 (RS1=0, RS0=0): write 0xAA to R0
      cpu.psw = 0x00; // Bank 0
      cpu.pc = 0;
      expect(cpu.bank).toBe(0);
      expect(cpu.bankBase).toBe(0x00);
      cpu.loadProgram([0x78, 0xAA]); // MOV R0, #0xAA
      cpu.step();
      expect(cpu.ram[0x00]).toBe(0xAA);
      expect(cpu.getRegister(0)).toBe(0xAA);

      // 2. Switch to Bank 1 (RS1=0, RS0=1): write 0xBB to R0
      cpu.psw = PSW_MASK.RS0; // 0x08 -> Bank 1
      cpu.pc = 0;
      expect(cpu.bank).toBe(1);
      expect(cpu.bankBase).toBe(0x08);
      expect(cpu.getRegister(0)).toBe(0x00); // Empty in bank 1
      cpu.loadProgram([0x78, 0xBB]); // MOV R0, #0xBB
      cpu.step();
      expect(cpu.ram[0x08]).toBe(0xBB);
      expect(cpu.getRegister(0)).toBe(0xBB);

      // 3. Switch to Bank 2 (RS1=1, RS0=0): write 0xCC to R0
      cpu.psw = PSW_MASK.RS1; // 0x10 -> Bank 2
      cpu.pc = 0;
      expect(cpu.bank).toBe(2);
      expect(cpu.bankBase).toBe(0x10);
      cpu.loadProgram([0x78, 0xCC]); // MOV R0, #0xCC
      cpu.step();
      expect(cpu.ram[0x10]).toBe(0xCC);
      expect(cpu.getRegister(0)).toBe(0xCC);

      // 4. Switch to Bank 3 (RS1=1, RS0=1): write 0xDD to R0
      cpu.psw = PSW_MASK.RS1 | PSW_MASK.RS0; // 0x18 -> Bank 3
      cpu.pc = 0;
      expect(cpu.bank).toBe(3);
      expect(cpu.bankBase).toBe(0x18);
      cpu.loadProgram([0x78, 0xDD]); // MOV R0, #0xDD
      cpu.step();
      expect(cpu.ram[0x18]).toBe(0xDD);
      expect(cpu.getRegister(0)).toBe(0xDD);

      // 5. Switch back to Bank 0 and verify R0 is still 0xAA
      cpu.psw = 0x00;
      expect(cpu.getRegister(0)).toBe(0xAA);

      // 6. Direct addressing confirms RAM layout
      expect(cpu.readDirect(0x00)).toBe(0xAA);
      expect(cpu.readDirect(0x08)).toBe(0xBB);
      expect(cpu.readDirect(0x10)).toBe(0xCC);
      expect(cpu.readDirect(0x18)).toBe(0xDD);
    });

    it('switches bank using bit instructions (SETB / CLR on PSW bits)', () => {
      // Bit address for PSW.3 (RS0) is 0xD3
      // Bit address for PSW.4 (RS1) is 0xD4
      cpu.psw = 0x00;
      expect(cpu.bank).toBe(0);

      // Sequence:
      // 1. SETB 0xD3 (sets RS0 -> Bank 1)
      // 2. SETB 0xD4 (sets RS1 -> Bank 3)
      // 3. CLR  0xD3 (clears RS0 -> Bank 2)
      cpu.loadProgram([0xD2, 0xD3, 0xD2, 0xD4, 0xC2, 0xD3]);

      cpu.step();
      expect(cpu.bank).toBe(1);
      expect(cpu.getFlag(PSW_MASK.RS0)).toBe(true);

      cpu.step();
      expect(cpu.bank).toBe(3);
      expect(cpu.getFlag(PSW_MASK.RS1)).toBe(true);

      cpu.step();
      expect(cpu.bank).toBe(2);
      expect(cpu.getFlag(PSW_MASK.RS0)).toBe(false);
    });
  });

  describe('Base Opcode Groups', () => {
    it('executes NOP (0x00) with 1 cycle', () => {
      cpu.loadProgram([0x00]);
      const { cycles } = cpu.step();
      expect(cycles).toBe(1);
      expect(cpu.pc).toBe(1);
    });

    describe('MOV Instructions', () => {
      it('MOV A, #data and MOV A, direct and MOV direct, A', () => {
        // MOV A, #0x55 (0x74 0x55)
        // MOV 0x30, A  (0xF5 0x30)
        // MOV A, 0x30  (0xE5 0x30)
        cpu.loadProgram([0x74, 0x55, 0xF5, 0x30, 0xE5, 0x30]);

        cpu.step();
        expect(cpu.acc).toBe(0x55);

        cpu.step();
        expect(cpu.ram[0x30]).toBe(0x55);

        cpu.acc = 0;
        cpu.step();
        expect(cpu.acc).toBe(0x55);
      });

      it('MOV Rn, #data and MOV A, Rn and MOV Rn, A', () => {
        // MOV R3, #0x42 (0x7B 0x42)
        // MOV A, R3     (0xEB)
        // MOV R7, A     (0xFF)
        cpu.loadProgram([0x7B, 0x42, 0xEB, 0xFF]);

        cpu.step();
        expect(cpu.getRegister(3)).toBe(0x42);

        cpu.step();
        expect(cpu.acc).toBe(0x42);

        cpu.step();
        expect(cpu.getRegister(7)).toBe(0x42);
      });

      it('MOV @Ri, #data and MOV A, @Ri and MOV @Ri, A', () => {
        // Set R0 pointer to 0x40
        cpu.setRegister(0, 0x40);

        // MOV @R0, #0x88 (0x76 0x88)
        // MOV A, @R0     (0xE6)
        // MOV @R1, A     (0xF7 with R1=0x41)
        cpu.setRegister(1, 0x41);
        cpu.loadProgram([0x76, 0x88, 0xE6, 0xF7]);

        cpu.step();
        expect(cpu.ram[0x40]).toBe(0x88);

        cpu.step();
        expect(cpu.acc).toBe(0x88);

        cpu.step();
        expect(cpu.ram[0x41]).toBe(0x88);
      });

      it('MOV direct, direct (0x85 src dest)', () => {
        cpu.ram[0x25] = 0xFE;
        // MOV 0x50, 0x25 (0x85 0x25 0x50)
        cpu.loadProgram([0x85, 0x25, 0x50]);
        const { cycles } = cpu.step();
        expect(cycles).toBe(2);
        expect(cpu.ram[0x50]).toBe(0xFE);
      });

      it('MOV DPTR, #data16 (0x90)', () => {
        cpu.loadProgram([0x90, 0x12, 0x34]);
        const { cycles } = cpu.step();
        expect(cycles).toBe(2);
        expect(cpu.dptr).toBe(0x1234);
        expect(cpu.dph).toBe(0x12);
        expect(cpu.dpl).toBe(0x34);
      });
    });

    describe('ADD and SUBB Instructions', () => {
      it('ADD A, direct and ADD A, Rn and ADD A, @Ri', () => {
        cpu.acc = 10;
        cpu.ram[0x30] = 5;
        cpu.setRegister(2, 7);
        cpu.setRegister(0, 0x40);
        cpu.ram[0x40] = 3;

        // ADD A, 0x30 (0x25 0x30) -> A=15
        // ADD A, R2   (0x2A)      -> A=22
        // ADD A, @R0  (0x26)      -> A=25
        cpu.loadProgram([0x25, 0x30, 0x2A, 0x26]);

        cpu.step();
        expect(cpu.acc).toBe(15);

        cpu.step();
        expect(cpu.acc).toBe(22);

        cpu.step();
        expect(cpu.acc).toBe(25);
      });

      it('SUBB A, direct and SUBB A, Rn and SUBB A, @Ri', () => {
        cpu.acc = 50;
        cpu.ram[0x30] = 10;
        cpu.setRegister(5, 5);
        cpu.setRegister(1, 0x50);
        cpu.ram[0x50] = 15;
        cpu.setFlag(PSW_MASK.CY, false);

        // SUBB A, 0x30 (0x95 0x30) -> A=40
        // SUBB A, R5   (0x9D)      -> A=35
        // SUBB A, @R1  (0x97)      -> A=20
        cpu.loadProgram([0x95, 0x30, 0x9D, 0x97]);

        cpu.step();
        expect(cpu.acc).toBe(40);

        cpu.step();
        expect(cpu.acc).toBe(35);

        cpu.step();
        expect(cpu.acc).toBe(20);
      });
    });

    describe('INC and DEC Instructions', () => {
      it('INC A, direct, @Ri, Rn, and DPTR', () => {
        cpu.acc = 0xFE;
        cpu.ram[0x30] = 0xFF;
        cpu.setRegister(0, 0x60);
        cpu.ram[0x60] = 0x09;
        cpu.setRegister(4, 0x20);
        cpu.dptr = 0x01FF;

        // INC A      (0x04)
        // INC 0x30   (0x05 0x30)
        // INC @R0    (0x06)
        // INC R4     (0x0C)
        // INC DPTR   (0xA3)
        cpu.loadProgram([0x04, 0x05, 0x30, 0x06, 0x0C, 0xA3]);

        cpu.step();
        expect(cpu.acc).toBe(0xFF);

        cpu.step();
        expect(cpu.ram[0x30]).toBe(0x00); // 8-bit wrap

        cpu.step();
        expect(cpu.ram[0x60]).toBe(0x0A);

        cpu.step();
        expect(cpu.getRegister(4)).toBe(0x21);

        const { cycles } = cpu.step();
        expect(cycles).toBe(2);
        expect(cpu.dptr).toBe(0x0200);
      });

      it('DEC A, direct, @Ri, and Rn', () => {
        cpu.acc = 0x00;
        cpu.ram[0x30] = 0x01;
        cpu.setRegister(1, 0x70);
        cpu.ram[0x70] = 0x10;
        cpu.setRegister(6, 0x00);

        // DEC A      (0x14)
        // DEC 0x30   (0x15 0x30)
        // DEC @R1    (0x17)
        // DEC R6     (0x1E)
        cpu.loadProgram([0x14, 0x15, 0x30, 0x17, 0x1E]);

        cpu.step();
        expect(cpu.acc).toBe(0xFF); // wraps to 255

        cpu.step();
        expect(cpu.ram[0x30]).toBe(0x00);

        cpu.step();
        expect(cpu.ram[0x70]).toBe(0x0F);

        cpu.step();
        expect(cpu.getRegister(6)).toBe(0xFF);
      });
    });

    describe('Jump Instructions (SJMP, AJMP, LJMP, JZ, JNZ)', () => {
      it('SJMP relative forward and backward', () => {
        // SJMP +0x04 -> PC = PC_after_fetch (2) + 4 = 6
        cpu.loadProgram([0x80, 0x04]);
        const { cycles } = cpu.step();
        expect(cycles).toBe(2);
        expect(cpu.pc).toBe(6);

        // Backward jump: SJMP -2 -> jump to self (0x06: 0x80 0xFE -> PC = 8 - 2 = 6)
        cpu.loadProgram([0x80, 0xFE], 6);
        cpu.step();
        expect(cpu.pc).toBe(6);
      });

      it('LJMP addr16 anywhere in 64KB', () => {
        // LJMP 0x8051 (0x02 0x80 0x51)
        cpu.loadProgram([0x02, 0x80, 0x51]);
        const { cycles } = cpu.step();
        expect(cycles).toBe(2);
        expect(cpu.pc).toBe(0x8051);
      });

      it('AJMP addr11 within 2KB block', () => {
        // Place AJMP at PC = 0x0100
        cpu.pc = 0x0100;
        // AJMP with opcode 0x41 (addr10..8 = 010b = 2) and byte 0x20
        // Expected target: (0x0102 & 0xF800) | (2 << 8) | 0x20 = 0x0000 | 0x0200 | 0x0020 = 0x0220
        cpu.loadProgram([0x41, 0x20], 0x0100);
        const { cycles } = cpu.step();
        expect(cycles).toBe(2);
        expect(cpu.pc).toBe(0x0220);
      });

      it('JZ branches if ACC is zero and does not branch if ACC is non-zero', () => {
        // 1. ACC is 0 -> taken
        cpu.acc = 0;
        cpu.loadProgram([0x60, 0x0A]); // JZ +10 -> target = 2 + 10 = 12
        cpu.step();
        expect(cpu.pc).toBe(12);

        // 2. ACC is non-zero -> not taken
        cpu.acc = 42;
        cpu.loadProgram([0x60, 0x0A], 12);
        cpu.step();
        expect(cpu.pc).toBe(14); // Next instruction
      });

      it('JNZ branches if ACC is non-zero and does not branch if ACC is zero', () => {
        // 1. ACC is non-zero -> taken
        cpu.acc = 1;
        cpu.loadProgram([0x70, 0x05]); // JNZ +5 -> target = 2 + 5 = 7
        cpu.step();
        expect(cpu.pc).toBe(7);

        // 2. ACC is 0 -> not taken
        cpu.acc = 0;
        cpu.loadProgram([0x70, 0x05], 7);
        cpu.step();
        expect(cpu.pc).toBe(9);
      });
    });

    describe('Stack and Subroutine Instructions', () => {
      it('executes PUSH and POP correctly', () => {
        cpu.ram[0x20] = 0x42;
        // PUSH 0x20 (0xC0 0x20)
        // POP  0x30 (0xD0 0x30)
        cpu.loadProgram([0xC0, 0x20, 0xD0, 0x30]);

        cpu.step();
        expect(cpu.sp).toBe(0x08);
        expect(cpu.ram[0x08]).toBe(0x42);

        cpu.step();
        expect(cpu.sp).toBe(0x07);
        expect(cpu.ram[0x30]).toBe(0x42);
      });

      it('executes LCALL and RET correctly', () => {
        // LCALL 0x0500 (0x12 0x05 0x00)
        cpu.loadProgram([0x12, 0x05, 0x00]);
        // RET at 0x0500 (0x22)
        cpu.loadProgram([0x22], 0x0500);

        cpu.step(); // LCALL
        expect(cpu.pc).toBe(0x0500);
        expect(cpu.sp).toBe(0x09); // Pushed return address (0x0003)

        cpu.step(); // RET
        expect(cpu.pc).toBe(0x0003);
        expect(cpu.sp).toBe(0x07);
      });
    });

    describe('Loops and Comparisons (DJNZ, CJNE)', () => {
      it('executes DJNZ Rn until zero', () => {
        cpu.setRegister(2, 2);
        // DJNZ R2, -2 (0xDA 0xFE) -> jumps to self until R2 reaches 0
        cpu.loadProgram([0xDA, 0xFE]);

        // Iteration 1: R2 becomes 1, branches back to 0
        const res1 = cpu.step();
        expect(res1.cycles).toBe(2);
        expect(cpu.getRegister(2)).toBe(1);
        expect(cpu.pc).toBe(0);

        // Iteration 2: R2 becomes 0, does not branch -> PC = 2
        const res2 = cpu.step();
        expect(res2.cycles).toBe(2);
        expect(cpu.getRegister(2)).toBe(0);
        expect(cpu.pc).toBe(2);
      });

      it('executes CJNE A, #data, rel with CY flag update', () => {
        cpu.acc = 10;
        // CJNE A, #20, +4 (0xB4 0x14 0x04)
        cpu.loadProgram([0xB4, 0x14, 0x04]);
        cpu.step();
        // Since 10 !== 20 and 10 < 20: CY should be true, PC = 3 + 4 = 7
        expect(cpu.pc).toBe(7);
        expect(cpu.getFlag(PSW_MASK.CY)).toBe(true);

        // Test equal condition: not taken, CY cleared
        cpu.pc = 0;
        cpu.acc = 20;
        cpu.loadProgram([0xB4, 0x14, 0x04]);
        cpu.step();
        expect(cpu.pc).toBe(3);
        expect(cpu.getFlag(PSW_MASK.CY)).toBe(false);
      });
    });

    describe('Logic and Bit Manipulation', () => {
      it('executes CLR, SETB, and CPL on Accumulator and Carry', () => {
        cpu.acc = 0xAA;
        cpu.setFlag(PSW_MASK.CY, false);
        // CPL A (0xF4)
        // SETB C (0xD3)
        // CPL C (0xB3)
        // CLR A (0xE4)
        cpu.loadProgram([0xF4, 0xD3, 0xB3, 0xE4]);

        cpu.step();
        expect(cpu.acc).toBe(0x55);
        expect(cpu.getFlag(PSW_MASK.P)).toBe(false); // 0x55 has 4 ones (even) -> P = 0

        cpu.step();
        expect(cpu.getFlag(PSW_MASK.CY)).toBe(true);

        cpu.step();
        expect(cpu.getFlag(PSW_MASK.CY)).toBe(false);

        cpu.step();
        expect(cpu.acc).toBe(0x00);
        expect(cpu.getFlag(PSW_MASK.P)).toBe(false);
      });

      it('executes ANL, ORL, and XRL', () => {
        cpu.acc = 0x0F;
        // ORL A, #0xF0 (0x44 0xF0) -> A = 0xFF
        // ANL A, #0x55 (0x54 0x55) -> A = 0x55
        // XRL A, #0x05 (0x64 0x05) -> A = 0x50
        cpu.loadProgram([0x44, 0xF0, 0x54, 0x55, 0x64, 0x05]);

        cpu.step();
        expect(cpu.acc).toBe(0xFF);

        cpu.step();
        expect(cpu.acc).toBe(0x55);

        cpu.step();
        expect(cpu.acc).toBe(0x50);
      });

      it('executes MUL AB and DIV AB correctly', () => {
        // MUL AB: 5 * 10 = 50 (0x32)
        cpu.acc = 5;
        cpu.b = 10;
        cpu.loadProgram([0xA4]); // MUL AB
        const mulRes = cpu.step();
        expect(mulRes.cycles).toBe(4);
        expect(cpu.acc).toBe(50);
        expect(cpu.b).toBe(0);
        expect(cpu.getFlag(PSW_MASK.OV)).toBe(false);

        // MUL AB with overflow: 200 * 2 = 400 (0x0190)
        cpu.pc = 0;
        cpu.acc = 200;
        cpu.b = 2;
        cpu.loadProgram([0xA4]);
        cpu.step();
        expect(cpu.acc).toBe(0x90);
        expect(cpu.b).toBe(0x01);
        expect(cpu.getFlag(PSW_MASK.OV)).toBe(true);

        // DIV AB: 49 / 5 = 9 rem 4
        cpu.pc = 0;
        cpu.acc = 49;
        cpu.b = 5;
        cpu.loadProgram([0x84]); // DIV AB
        const divRes = cpu.step();
        expect(divRes.cycles).toBe(4);
        expect(cpu.acc).toBe(9);
        expect(cpu.b).toBe(4);
        expect(cpu.getFlag(PSW_MASK.OV)).toBe(false);

        // DIV by zero: OV = 1
        cpu.pc = 0;
        cpu.acc = 10;
        cpu.b = 0;
        cpu.loadProgram([0x84]);
        cpu.step();
        expect(cpu.getFlag(PSW_MASK.OV)).toBe(true);
      });

      it('executes SWAP and Rotate instructions', () => {
        // SWAP A: 0x12 -> 0x21
        cpu.acc = 0x12;
        cpu.loadProgram([0xC4]); // SWAP A
        cpu.step();
        expect(cpu.acc).toBe(0x21);

        // RL A: 0x81 -> 0x03
        cpu.pc = 0;
        cpu.acc = 0x81;
        cpu.loadProgram([0x23]); // RL A
        cpu.step();
        expect(cpu.acc).toBe(0x03);

        // RR A: 0x03 -> 0x81
        cpu.pc = 0;
        cpu.acc = 0x03;
        cpu.loadProgram([0x03]); // RR A
        cpu.step();
        expect(cpu.acc).toBe(0x81);
      });
    });

    describe('Error Handling', () => {
      it('throws an error for unimplemented or invalid opcodes', () => {
        // Opcode 0xA5 is undefined in standard 8051
        cpu.loadProgram([0xA5]);
        expect(() => cpu.step()).toThrowError(/Unimplemented opcode 0xA5/);
      });
    });
  });
});

