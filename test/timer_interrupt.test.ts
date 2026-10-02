import { describe, it, expect, beforeEach } from 'vitest';
import {
  CPU8051,
  SFR,
  PSW_MASK,
  TCON_MASK,
  TMOD_MASK,
  IE_MASK,
  IP_MASK,
  assemble,
} from '../src/index.js';

describe('Timer 0, Timer 1, and Interrupt Controller', () => {
  let cpu: CPU8051;

  beforeEach(() => {
    cpu = new CPU8051();
  });

  describe('1. Cycle Clocking & Stepper', () => {
    it('returns exact machine cycles consumed (1, 2, or 4) for various instructions', () => {
      // NOP: 1 cycle
      cpu.loadProgram([0x00]);
      expect(cpu.step().cycles).toBe(1);

      // MOV A, #data (0x74 0x55): 1 cycle
      cpu.pc = 0;
      cpu.loadProgram([0x74, 0x55]);
      expect(cpu.step().cycles).toBe(1);

      // MOV direct, #data (0x75 0x30 0xAA): 2 cycles
      cpu.pc = 0;
      cpu.loadProgram([0x75, 0x30, 0xaa]);
      expect(cpu.step().cycles).toBe(2);

      // SJMP rel (0x80 0x00): 2 cycles
      cpu.pc = 0;
      cpu.loadProgram([0x80, 0x00]);
      expect(cpu.step().cycles).toBe(2);

      // MUL AB (0xA4): 4 cycles
      cpu.pc = 0;
      cpu.loadProgram([0xa4]);
      expect(cpu.step().cycles).toBe(4);

      // DIV AB (0x84): 4 cycles
      cpu.pc = 0;
      cpu.loadProgram([0x84]);
      expect(cpu.step().cycles).toBe(4);
    });

    it('advances timer hardware automatically via tickPeripherals on every step', () => {
      // Configure Timer 0: Mode 1 (16-bit), C/T = 0, TR0 = 1
      cpu.tmod = 0x01;
      cpu.th0 = 0x00;
      cpu.tl0 = 0x00;
      cpu.tcon = TCON_MASK.TR0; // Run Timer 0

      // Execute NOP (1 cycle)
      cpu.loadProgram([0x00]);
      cpu.step();
      expect(cpu.tl0).toBe(1);

      // Execute MUL AB (4 cycles)
      cpu.acc = 2;
      cpu.b = 3;
      cpu.pc = 0;
      cpu.loadProgram([0xa4]);
      cpu.step();
      expect(cpu.tl0).toBe(5); // 1 + 4 = 5 cycles
    });
  });

  describe('2. Timers (TCON 0x88, TMOD 0x89)', () => {
    describe('Mode 1: 16-Bit Counter', () => {
      it('Timer 0 Mode 1 increments on internal clock and sets TF0 on 16-bit rollover', () => {
        // Mode 1: 16-bit counter
        cpu.tmod = 0x01;
        cpu.th0 = 0xff;
        cpu.tl0 = 0xfe;
        cpu.tcon = TCON_MASK.TR0; // Start Timer 0

        // Step 1: 1 cycle -> TL0 = 0xFF, TH0 = 0xFF, TF0 = 0
        cpu.loadProgram([0x00, 0x00, 0x00]);
        cpu.step();
        expect(cpu.tl0).toBe(0xff);
        expect(cpu.th0).toBe(0xff);
        expect(cpu.tcon & TCON_MASK.TF0).toBe(0);

        // Step 2: 1 cycle -> 0xFFFF rolls over to 0x0000, TF0 becomes 1
        cpu.step();
        expect(cpu.tl0).toBe(0x00);
        expect(cpu.th0).toBe(0x00);
        expect((cpu.tcon & TCON_MASK.TF0) !== 0).toBe(true);

        // Step 3: continues counting from 0x0000 -> 0x0001
        cpu.step();
        expect(cpu.tl0).toBe(0x01);
        expect(cpu.th0).toBe(0x00);
      });

      it('Timer 1 Mode 1 increments and sets TF1 on rollover', () => {
        // Mode 1 for Timer 1
        cpu.tmod = 0x10;
        cpu.th1 = 0xff;
        cpu.tl1 = 0xff;
        cpu.tcon = TCON_MASK.TR1; // Start Timer 1

        // Execute 2-cycle instruction: MOV direct, #data (0x75 0x30 0x12)
        cpu.loadProgram([0x75, 0x30, 0x12]);
        const res = cpu.step();
        expect(res.cycles).toBe(2);

        // 0xFFFF + 2 cycles -> 0x0001, TF1 set
        expect(cpu.tl1).toBe(0x01);
        expect(cpu.th1).toBe(0x00);
        expect((cpu.tcon & TCON_MASK.TF1) !== 0).toBe(true);
      });

      it('does not increment timers if TRx is 0 or C/T is 1 (external counter)', () => {
        // Timer 0: TR0 is 0
        cpu.tmod = 0x01;
        cpu.tl0 = 0x10;
        cpu.th0 = 0x20;
        cpu.tcon = 0x00; // TR0 = 0

        cpu.loadProgram([0x00]);
        cpu.step();
        expect(cpu.tl0).toBe(0x10);
        expect(cpu.th0).toBe(0x20);

        // Timer 1: C/T = 1 (Counter mode, not clocked internally)
        cpu.tmod = TMOD_MASK.T1_CT | 0x10; // C/T=1, Mode 1
        cpu.tl1 = 0x50;
        cpu.th1 = 0x60;
        cpu.tcon = TCON_MASK.TR1; // TR1 = 1

        cpu.pc = 0;
        cpu.loadProgram([0x00]);
        cpu.step();
        expect(cpu.tl1).toBe(0x50);
        expect(cpu.th1).toBe(0x60);
      });
    });

    describe('Mode 2: 8-Bit Auto-Reload', () => {
      it('Timer 0 Mode 2 automatically reloads from TH0 into TL0 and sets TF0 upon overflow', () => {
        // Mode 2: 8-bit auto-reload
        cpu.tmod = 0x02;
        cpu.th0 = 0xce; // Reload value = 206 (50 cycles period: 256 - 50 = 206)
        cpu.tl0 = 0xfd; // 253 -> will overflow after 3 cycles
        cpu.tcon = TCON_MASK.TR0;

        cpu.loadProgram([0x00, 0x00, 0x00, 0x00]);

        // Cycle 1: TL0 -> 254 (0xFE)
        cpu.step();
        expect(cpu.tl0).toBe(0xfe);
        expect(cpu.tcon & TCON_MASK.TF0).toBe(0);

        // Cycle 2: TL0 -> 255 (0xFF)
        cpu.step();
        expect(cpu.tl0).toBe(0xff);
        expect(cpu.tcon & TCON_MASK.TF0).toBe(0);

        // Cycle 3: TL0 rolls over to 0 -> reloads to TH0 (0xCE), TF0 set!
        cpu.step();
        expect(cpu.tl0).toBe(0xce);
        expect(cpu.th0).toBe(0xce);
        expect((cpu.tcon & TCON_MASK.TF0) !== 0).toBe(true);

        // Cycle 4: TL0 increments from reloaded value -> 0xCF
        cpu.step();
        expect(cpu.tl0).toBe(0xcf);
      });

      it('Timer 1 Mode 2 auto-reloads and sets TF1 correctly across multi-cycle steps', () => {
        cpu.tmod = 0x20; // Timer 1 Mode 2
        cpu.th1 = 0x80;
        cpu.tl1 = 0xfe; // 254
        cpu.tcon = TCON_MASK.TR1;

        // Step 2 cycles: 254 + 1 -> 255, 255 + 1 -> rolls over to 0 -> reloaded to 0x80
        cpu.loadProgram([0x80, 0x00]); // SJMP rel (2 cycles)
        const res = cpu.step();
        expect(res.cycles).toBe(2);
        expect(cpu.tl1).toBe(0x80);
        expect((cpu.tcon & TCON_MASK.TF1) !== 0).toBe(true);
      });
    });
  });

  describe('3. Interrupt Engine (IE 0xA8, IP 0xB8, RETI 0x32)', () => {
    it('does not service interrupts if global interrupt enable EA (IE.7) is 0', () => {
      cpu.pc = 0x0100;
      cpu.tcon = TCON_MASK.TF0; // TF0 is set
      cpu.ie = IE_MASK.ET0;     // ET0 is enabled, but EA is 0

      cpu.loadProgram([0x00], 0x0100); // NOP
      const res = cpu.step();

      // Normal instruction executed, did not branch to vector 0x000B
      expect(res.cycles).toBe(1);
      expect(cpu.pc).toBe(0x0101);
      expect((cpu.tcon & TCON_MASK.TF0) !== 0).toBe(true); // Flag remains
      expect(cpu.isInterruptActive).toBe(false);
    });

    it('services Timer 0 interrupt at vector 0x000B: pushes PC (SP += 2), clears TF0, sets latch, consumes 2 cycles', () => {
      cpu.pc = 0x0250;
      cpu.sp = 0x07;
      cpu.ie = IE_MASK.EA | IE_MASK.ET0; // EA=1, ET0=1
      cpu.tcon = TCON_MASK.TF0;          // TF0=1

      const res = cpu.step();

      // Consumed 2 machine cycles for interrupt vectoring
      expect(res.cycles).toBe(2);
      // PC jumped to Timer 0 vector
      expect(cpu.pc).toBe(0x000b);
      // Hardware automatically cleared TF0
      expect(cpu.tcon & TCON_MASK.TF0).toBe(0);
      // SP incremented by 2
      expect(cpu.sp).toBe(0x09);
      // Return address 0x0250 pushed: low byte (0x50) at SP-1 (0x08), high byte (0x02) at SP (0x09)
      expect(cpu.ram[0x08]).toBe(0x50);
      expect(cpu.ram[0x09]).toBe(0x02);
      // Internal interrupt-in-service latch is set
      expect(cpu.isInterruptActive).toBe(true);
    });

    it('services Timer 1 interrupt at vector 0x001B and clears TF1', () => {
      cpu.pc = 0x0300;
      cpu.ie = IE_MASK.EA | IE_MASK.ET1; // EA=1, ET1=1
      cpu.tcon = TCON_MASK.TF1;          // TF1=1

      const res = cpu.step();
      expect(res.cycles).toBe(2);
      expect(cpu.pc).toBe(0x001b);
      expect(cpu.tcon & TCON_MASK.TF1).toBe(0); // TF1 cleared
      expect(cpu.isInterruptActive).toBe(true);
    });

    it('RETI opcode (0x32) pops PC from stack, clears interrupt latch, and consumes 2 cycles', () => {
      // Simulate being inside an ISR
      cpu.pc = 0x0200;
      cpu.sp = 0x07;
      cpu.ie = IE_MASK.EA | IE_MASK.ET0;
      cpu.tcon = TCON_MASK.TF0;

      // Service interrupt
      cpu.step();
      expect(cpu.pc).toBe(0x000b);
      expect(cpu.isInterruptActive).toBe(true);

      // Place RETI instruction (0x32) at vector 0x000B
      cpu.loadProgram([0x32], 0x000b);

      // Step RETI
      const res = cpu.step();
      expect(res.cycles).toBe(2);
      // PC restored to interrupted address 0x0200
      expect(cpu.pc).toBe(0x0200);
      // SP restored to 0x07
      expect(cpu.sp).toBe(0x07);
      // Interrupt latch cleared
      expect(cpu.isInterruptActive).toBe(false);
    });

    it('handles interrupt priority via IP: high-priority Timer 1 preempts low-priority Timer 0', () => {
      cpu.pc = 0x0100;
      cpu.ie = IE_MASK.EA | IE_MASK.ET0 | IE_MASK.ET1; // Both enabled
      cpu.ip = IP_MASK.PT1; // Timer 1 is High Priority, Timer 0 is Low Priority
      cpu.tcon = TCON_MASK.TF0; // Timer 0 requested

      // 1. Service low-priority Timer 0 interrupt
      cpu.step();
      expect(cpu.pc).toBe(0x000b);
      expect(cpu.isInterruptLowActive).toBe(true);
      expect(cpu.isInterruptHighActive).toBe(false);

      // 2. While in Timer 0 ISR, high-priority Timer 1 interrupt occurs
      cpu.tcon = TCON_MASK.TF1;
      cpu.step(); // Check interrupts -> High-priority Timer 1 preempts!
      expect(cpu.pc).toBe(0x001b);
      expect(cpu.isInterruptHighActive).toBe(true);

      // 3. Put RETI at 0x001B (Timer 1 ISR end) and execute
      cpu.loadProgram([0x32], 0x001b);
      cpu.step();
      // Returns to Timer 0 ISR at 0x000B, high latch cleared, low latch still active
      expect(cpu.pc).toBe(0x000b);
      expect(cpu.isInterruptHighActive).toBe(false);
      expect(cpu.isInterruptLowActive).toBe(true);

      // 4. Put RETI at 0x000B (Timer 0 ISR end) and execute
      cpu.loadProgram([0x32], 0x000b);
      cpu.step();
      // Returns to original main code at 0x0100, all latches clear
      expect(cpu.pc).toBe(0x0100);
      expect(cpu.isInterruptActive).toBe(false);
    });
  });

  describe('4. Validation Test: Timer 0 Mode 2 Square Wave Generator (50 Cycles)', () => {
    it('simulates a square wave generator: Timer 0 in Mode 2 generating an interrupt every 50 cycles to toggle ACC.0', () => {
      // 8051 Assembly Program:
      // - Timer 0 in Mode 2 (8-bit auto-reload)
      // - Reload value = 256 - 50 = 206 (0xCE)
      // - Interrupts enabled (EA=1, ET0=1)
      // - ISR at 000BH toggles ACC.0 and executes RETI
      const source = `
        ORG 0000H
            LJMP MAIN

        ORG 000BH
            ; Timer 0 Interrupt Service Routine:
            ; Toggle square wave output at ACC.0
            CPL ACC.0
            RETI

        MAIN:
            MOV A, #00H         ; Square wave starts low (ACC.0 = 0)
            MOV TMOD, #02H      ; Timer 0 in Mode 2 (8-bit auto-reload, C/T=0)
            MOV TH0, #0CEH      ; Auto-reload value = 256 - 50 = 206 (0xCE)
            MOV TL0, #0CEH      ; Initial counter value
            MOV IE, #82H        ; Enable Global Interrupts (EA=1) & Timer 0 (ET0=1)
            SETB TR0            ; Start Timer 0

        LOOP:
            SJMP LOOP           ; Idle waiting for timer interrupts
      `;

      const { code, errors } = assemble(source);
      expect(errors).toHaveLength(0);

      cpu.loadProgram(code);

      // Step until Timer 0 is started (SETB TR0 executed)
      let totalCycles = 0;
      while ((cpu.tcon & TCON_MASK.TR0) === 0) {
        const res = cpu.step();
        totalCycles += res.cycles;
      }

      // Initial state after SETB TR0 executed (SETB TR0 consumes 1 cycle, so TL0 advanced by 1)
      expect(cpu.acc & 1).toBe(0); // ACC.0 is 0
      expect(cpu.tl0).toBe(0xce + 1);
      expect(cpu.th0).toBe(0xce);

      // Track toggles of ACC.0 and cycle counts at each toggle
      const toggleRecord: { cycle: number; val: number }[] = [];
      let previousAcc0 = cpu.acc & 1;
      const startTimerCycle = totalCycles;

      // Run simulation for 350 cycles to observe multiple square wave half-periods
      while (totalCycles - startTimerCycle < 350) {
        const res = cpu.step();
        totalCycles += res.cycles;

        const currentAcc0 = cpu.acc & 1;
        if (currentAcc0 !== previousAcc0) {
          toggleRecord.push({
            cycle: totalCycles,
            val: currentAcc0,
          });
          previousAcc0 = currentAcc0;
        }
      }

      // Verify that toggles occurred
      expect(toggleRecord.length).toBeGreaterThanOrEqual(6);

      // Verify square wave pattern: alternates 1, 0, 1, 0, 1, 0
      for (let i = 0; i < toggleRecord.length; i++) {
        expect(toggleRecord[i].val).toBe(i % 2 === 0 ? 1 : 0);
      }

      // Verify timing:
      // In 8051 hardware, instructions run to completion before an interrupt is serviced.
      // With a 2-cycle SJMP idle loop, individual toggle intervals are 50 ± 1 cycles (49 and 51),
      // and each full square wave period (2 consecutive toggles) is exactly 100 cycles (50 cycles/half-period)!
      for (let i = 1; i < toggleRecord.length; i++) {
        const cycleDelta = toggleRecord[i].cycle - toggleRecord[i - 1].cycle;
        expect(Math.abs(cycleDelta - 50)).toBeLessThanOrEqual(1);
      }

      for (let i = 2; i < toggleRecord.length; i++) {
        const fullPeriod = toggleRecord[i].cycle - toggleRecord[i - 2].cycle;
        expect(fullPeriod).toBe(100);
      }
    });
  });
});
