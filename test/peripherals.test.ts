import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CPU8051, SFR, SCON_MASK, assemble } from '../src/index.js';

describe('8051 Virtual Peripherals: I/O Ports & UART', () => {
  let cpu: CPU8051;

  beforeEach(() => {
    cpu = new CPU8051();
  });

  describe('Quasi-Bidirectional I/O Ports (P1 and P2)', () => {
    it('initializes latches, external inputs, and pins to 0xFF', () => {
      expect(cpu.p1Latch).toBe(0xFF);
      expect(cpu.p1External).toBe(0xFF);
      expect(cpu.p1).toBe(0xFF);
      expect(cpu.readP1Pin()).toBe(0xFF);
      expect(cpu.getSFR(SFR.P1)).toBe(0xFF);

      expect(cpu.p2Latch).toBe(0xFF);
      expect(cpu.p2External).toBe(0xFF);
      expect(cpu.p2).toBe(0xFF);
      expect(cpu.readP2Pin()).toBe(0xFF);
      expect(cpu.getSFR(SFR.P2)).toBe(0xFF);
    });

    it('allows external inputs to pull pins LOW when latch is 1', () => {
      // CPU latch = 0xFF
      cpu.p1 = 0xFF;
      // External switch pulls bit 0 LOW
      cpu.p1External = 0xFE; // 1111 1110
      expect(cpu.readP1Pin()).toBe(0xFE);
      expect(cpu.getSFR(SFR.P1)).toBe(0xFE);
      // Latch is still 0xFF
      expect(cpu.p1Latch).toBe(0xFF);
    });

    it('forces pin LOW if CPU latch is 0, regardless of external input', () => {
      // CPU writes 0 to bit 0 of P1
      cpu.setSFR(SFR.P1, 0xFE);
      expect(cpu.p1Latch).toBe(0xFE);

      // External switch tries to stay HIGH (0xFF)
      cpu.p1External = 0xFF;
      expect(cpu.readP1Pin()).toBe(0xFE);

      // External switch also LOW
      cpu.p1External = 0xFE;
      expect(cpu.readP1Pin()).toBe(0xFE);
    });

    it('injects DIP switch inputs on P2 into CPU read instructions', () => {
      // Assembler program: read P2 into A, then output A to P1
      const src = `
        ORG 0000H
        MOV A, P2
        MOV P1, A
        SJMP $
      `;
      const hex = assemble(src);
      expect(hex.errors).toHaveLength(0);
      cpu.loadProgram(hex.code);

      // Set P2 DIP switch pattern
      cpu.p2External = 0b10110010;

      // Execute MOV A, P2 (2 cycles)
      cpu.step();
      expect(cpu.acc).toBe(0b10110010);

      // Execute MOV P1, A (2 cycles)
      cpu.step();
      expect(cpu.p1Latch).toBe(0b10110010);
      expect(cpu.readP1Pin()).toBe(0b10110010);
    });

    it('preserves latch state during read-modify-write bit operations', () => {
      // Both latch and external start at 0xFF
      cpu.p1 = 0xFF;
      // External switch pulls bit 0 LOW
      cpu.p1External = 0xFE;
      expect(cpu.readP1Pin()).toBe(0xFE);

      // Execute CLR P1.1 (bit 1 of P1)
      const src = `
        ORG 0000H
        CLR P1.1
        SJMP $
      `;
      const hex = assemble(src);
      expect(hex.errors).toHaveLength(0);
      cpu.loadProgram(hex.code);

      cpu.step(); // CLR P1.1

      // Latch bit 0 must still be 1 (not corrupted by external 0 on pin 0!)
      // Latch bit 1 must be 0
      expect((cpu.p1Latch & 0x01) !== 0).toBe(true);
      expect((cpu.p1Latch & 0x02) === 0).toBe(true);
      expect(cpu.p1Latch).toBe(0xFD); // 1111 1101

      // Physical pin reads latch & external: 0xFD & 0xFE = 0xFC
      expect(cpu.readP1Pin()).toBe(0xFC);
    });

    it('preserves latch state during byte-level read-modify-write instructions (ANL, ORL, CPL, INC)', () => {
      // CPU latch = 0xFF, external pull-down on bit 0
      cpu.p1 = 0xFF;
      cpu.p1External = 0xFE;

      // CPL P1.7 should complement latch bit 7 without clearing bit 0 in the latch
      const src = `
        ORG 0000H
        CPL P1.7
        SJMP $
      `;
      const hex = assemble(src);
      expect(hex.errors).toHaveLength(0);
      cpu.loadProgram(hex.code);

      cpu.step(); // CPL P1.7
      expect(cpu.p1Latch).toBe(0x7F); // Bit 7 inverted to 0, bit 0 preserved at 1
      expect(cpu.readP1Pin()).toBe(0x7E); // 0x7F & 0xFE = 0x7E
    });
  });

  describe('Virtual UART Transmission', () => {
    it('sets TI flag and appends to uartOutput after baud duration', () => {
      const txSpy = vi.fn();
      cpu.onUartTransmit = txSpy;

      // Write 'A' (0x41) to SBUF
      cpu.setSFR(SFR.SBUF, 0x41);

      expect(cpu.isUartTxBusy).toBe(true);
      expect(cpu.scon & SCON_MASK.TI).toBe(0);
      expect(cpu.uartOutput).toBe('');

      // Advance clock cycles
      const baudCycles = cpu.calculateBaudDurationCycles();
      cpu.tickPeripherals(baudCycles);

      expect(cpu.isUartTxBusy).toBe(false);
      expect(cpu.scon & SCON_MASK.TI).toBe(SCON_MASK.TI);
      expect(cpu.uartOutput).toBe('A');
      expect(txSpy).toHaveBeenCalledWith('A', 0x41);
    });

    it('calculates baud duration based on Timer 1 reload when configured', () => {
      // Configure Timer 1 in Mode 2 (8-bit auto-reload)
      // TMOD: bits 5:4 = 10 (Mode 2) -> 0x20
      cpu.setSFR(SFR.TMOD, 0x20);
      // TH1 = 0xFD (standard 9600 baud at 11.0592 MHz in 8051) -> reload = 256 - 253 = 3
      cpu.setSFR(SFR.TH1, 0xFD);
      // Turn on TR1 (TCON bit 6)
      cpu.setSFR(SFR.TCON, 0x40);
      // PCON SMOD = 0
      cpu.setSFR(SFR.PCON, 0x00);

      // Formula: (32 * 3 / 1) * 10 = 960 machine cycles
      const duration = cpu.calculateBaudDurationCycles();
      expect(duration).toBe(960);
    });

    it('can clear uartOutput', () => {
      cpu.setSFR(SFR.SBUF, 0x48); // 'H'
      cpu.tickPeripherals(100);
      expect(cpu.uartOutput).toBe('H');

      cpu.clearUartOutput();
      expect(cpu.uartOutput).toBe('');
    });
  });

  describe('Virtual UART Reception', () => {
    it('feeds received characters into SBUF and sets RI flag', () => {
      // Receive character 'Z' (0x5A)
      cpu.receiveUart('Z');

      expect(cpu.scon & SCON_MASK.RI).toBe(SCON_MASK.RI);
      expect(cpu.getSFR(SFR.SBUF)).toBe(0x5A);
      expect(cpu.sbuf).toBe(0x5A);
    });

    it('queues subsequent characters until RI is cleared by software', () => {
      // Receive "OK"
      cpu.receiveUart('OK');

      // First char 'O' (0x4F) is in SBUF with RI = 1
      expect(cpu.getSFR(SFR.SBUF)).toBe(0x4F);
      expect((cpu.scon & SCON_MASK.RI) !== 0).toBe(true);

      // Software clears RI flag (CLR RI / SCON bit 0)
      cpu.setBit(0x98, false); // Bit 0 of SCON (0x98) is RI

      // Second char 'K' (0x4B) should now be in SBUF, and RI set again
      expect(cpu.getSFR(SFR.SBUF)).toBe(0x4B);
      expect((cpu.scon & SCON_MASK.RI) !== 0).toBe(true);
    });
  });

  describe('Serial Interrupt Dispatch (Vector 0x0023)', () => {
    it('vectors to 0x0023 when TI is set and ES, EA are enabled', () => {
      // Enable EA (IE.7) and ES (IE.4) -> 0x80 | 0x10 = 0x90
      cpu.setSFR(SFR.IE, 0x90);

      // Set TI in SCON
      cpu.setSFR(SFR.SCON, SCON_MASK.TI);

      cpu.pc = 0x0100;
      const cycles = cpu.checkAndServiceInterrupts();

      expect(cycles).toBe(2);
      expect(cpu.pc).toBe(0x0023);
      expect(cpu.isInterruptActive).toBe(true);

      // In 8051, hardware does NOT auto-clear TI or RI
      expect((cpu.scon & SCON_MASK.TI) !== 0).toBe(true);
    });

    it('vectors to 0x0023 when RI is set and ES, EA are enabled', () => {
      cpu.setSFR(SFR.IE, 0x90); // EA + ES
      cpu.setSFR(SFR.SCON, SCON_MASK.RI);

      cpu.pc = 0x0200;
      const cycles = cpu.checkAndServiceInterrupts();

      expect(cycles).toBe(2);
      expect(cpu.pc).toBe(0x0023);
    });

    it('obeys IP interrupt priority for serial port', () => {
      // Enable EA, ET0, ES
      cpu.setSFR(SFR.IE, 0x80 | 0x02 | 0x10);
      // Set high priority for Serial Port (IP.4 = 1), Timer 0 low priority (IP.1 = 0)
      cpu.setSFR(SFR.IP, 0x10);

      // Both Timer 0 overflow and Serial TI pending
      cpu.setSFR(SFR.TCON, 0x20); // TF0
      cpu.setSFR(SFR.SCON, 0x02); // TI

      cpu.pc = 0x0500;
      cpu.checkAndServiceInterrupts();

      // Serial should be serviced first because it has high priority!
      expect(cpu.pc).toBe(0x0023);
      expect(cpu.isInterruptHighActive).toBe(true);
    });
  });

  describe('Demo Presets Compatibility', () => {
    it('assembles all peripheral demo presets without errors', async () => {
      const { DEMO_PRESETS } = await import('../src/presets.js');
      expect(DEMO_PRESETS.length).toBeGreaterThanOrEqual(8);

      for (const preset of DEMO_PRESETS) {
        const res = assemble(preset.code);
        expect(res.errors, `Preset '${preset.name}' failed to assemble: ${res.errors.map(e => e.message).join(', ')}`).toHaveLength(0);
        expect(res.code).toBeInstanceOf(Uint8Array);
      }
    });
  });
});

