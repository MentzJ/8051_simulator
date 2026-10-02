import { SFR, PSW_MASK, type StepResult } from './types.js';
import { computeParity, calculateAddFlags, calculateSubbFlags } from './flags.js';
import { buildOpcodeTable, type OpcodeHandler } from './opcodes.js';

/**
 * Headless 8051 CPU Core Simulator
 */
export class CPU8051 {
  /** Internal RAM (256 bytes): lower 128 bytes + upper 128 bytes */
  public readonly ram: Uint8Array = new Uint8Array(256);

  /** Special Function Registers (128 bytes, addresses 0x80 to 0xFF) */
  public readonly sfr: Uint8Array = new Uint8Array(128);

  /** Program Memory / ROM (64 KB) */
  public readonly rom: Uint8Array = new Uint8Array(65536);

  /** 16-bit Program Counter */
  public pc: number = 0;

  /** Internal registers */
  private _sp: number = 0x07;
  private _acc: number = 0x00;
  private _b: number = 0x00;
  private _dpl: number = 0x00;
  private _dph: number = 0x00;
  private _psw: number = 0x00;

  /** Internal interrupt-in-service priority tracking */
  private inServiceHigh: boolean = false;
  private inServiceLow: boolean = false;
  private isrPriorityStack: number[] = [];

  /** 256-element jump table for instruction execution */
  private readonly jumpTable: OpcodeHandler[];

  constructor() {
    this.jumpTable = buildOpcodeTable();
    this.reset();
  }

  /**
   * Resets the CPU state according to 8051 hardware specifications.
   * - PC resets to 0x0000
   * - SP resets to 0x07
   * - ACC, B, PSW, DPTR reset to 0x00
   * - Default ports (P0-P3) set to 0xFF
   * - Interrupt latches cleared
   */
  public reset(): void {
    this.pc = 0x0000;
    this.ram.fill(0);
    this.sfr.fill(0);
    this._sp = 0x07;
    this._acc = 0x00;
    this._b = 0x00;
    this._dpl = 0x00;
    this._dph = 0x00;
    this._psw = 0x00;

    // Reset interrupt service state
    this.inServiceHigh = false;
    this.inServiceLow = false;
    this.isrPriorityStack = [];

    // Synchronize default SFR values
    this.sfr[SFR.SP - 0x80] = 0x07;
    this.sfr[SFR.P0 - 0x80] = 0xFF;
    this.sfr[SFR.P1 - 0x80] = 0xFF;
    this.sfr[SFR.P2 - 0x80] = 0xFF;
    this.sfr[SFR.P3 - 0x80] = 0xFF;
  }

  /**
   * Dedicated getter for SFR addresses (0x80 - 0xFF).
   * Note: In 8051 hardware, PSW.P (bit 0) dynamically reflects the odd parity of ACC.
   */
  public getSFR(address: number): number {
    address &= 0xFF;
    if (address < 0x80) {
      throw new Error(`Address 0x${address.toString(16).toUpperCase()} is not in SFR range (0x80-0xFF)`);
    }

    switch (address) {
      case SFR.ACC: // 0xE0
        return this._acc;
      case SFR.B:   // 0xF0
        return this._b;
      case SFR.PSW: // 0xD0
        this.syncParityFlag();
        return this._psw;
      case SFR.SP:  // 0x81
        return this._sp;
      case SFR.DPL: // 0x82
        return this._dpl;
      case SFR.DPH: // 0x83
        return this._dph;
      default:
        return this.sfr[address - 0x80];
    }
  }

  /**
   * Dedicated setter for SFR addresses (0x80 - 0xFF).
   */
  public setSFR(address: number, value: number): void {
    address &= 0xFF;
    value &= 0xFF;
    if (address < 0x80) {
      throw new Error(`Address 0x${address.toString(16).toUpperCase()} is not in SFR range (0x80-0xFF)`);
    }

    this.sfr[address - 0x80] = value;

    switch (address) {
      case SFR.ACC: // 0xE0
        this._acc = value;
        this.syncParityFlag();
        break;
      case SFR.B:   // 0xF0
        this._b = value;
        break;
      case SFR.PSW: // 0xD0
        // Update PSW, keeping parity synchronized with ACC
        this._psw = (value & ~PSW_MASK.P) | computeParity(this._acc);
        this.sfr[SFR.PSW - 0x80] = this._psw;
        break;
      case SFR.SP:  // 0x81
        this._sp = value;
        break;
      case SFR.DPL: // 0x82
        this._dpl = value;
        break;
      case SFR.DPH: // 0x83
        this._dph = value;
        break;
    }
  }

  /**
   * Synchronizes the Parity bit in PSW (bit 0) with ACC's current parity.
   */
  private syncParityFlag(): void {
    this._psw = (this._psw & ~PSW_MASK.P) | computeParity(this._acc);
    this.sfr[SFR.PSW - 0x80] = this._psw;
  }

  // --- Register Accessors ---

  public get acc(): number {
    return this._acc;
  }
  public set acc(val: number) {
    this.setSFR(SFR.ACC, val);
  }

  public get a(): number {
    return this._acc;
  }
  public set a(val: number) {
    this.setSFR(SFR.ACC, val);
  }

  public get b(): number {
    return this._b;
  }
  public set b(val: number) {
    this.setSFR(SFR.B, val);
  }

  public get psw(): number {
    return this.getSFR(SFR.PSW);
  }
  public set psw(val: number) {
    this.setSFR(SFR.PSW, val);
  }

  public get sp(): number {
    return this._sp;
  }
  public set sp(val: number) {
    this.setSFR(SFR.SP, val);
  }

  public get dpl(): number {
    return this._dpl;
  }
  public set dpl(val: number) {
    this.setSFR(SFR.DPL, val);
  }

  public get dph(): number {
    return this._dph;
  }
  public set dph(val: number) {
    this.setSFR(SFR.DPH, val);
  }

  public get dptr(): number {
    return (this._dph << 8) | this._dpl;
  }
  public set dptr(val: number) {
    val &= 0xFFFF;
    this.dph = (val >> 8) & 0xFF;
    this.dpl = val & 0xFF;
  }

  // --- Peripheral & Control SFR Accessors ---

  public get tcon(): number {
    return this.getSFR(SFR.TCON);
  }
  public set tcon(val: number) {
    this.setSFR(SFR.TCON, val);
  }

  public get tmod(): number {
    return this.getSFR(SFR.TMOD);
  }
  public set tmod(val: number) {
    this.setSFR(SFR.TMOD, val);
  }

  public get tl0(): number {
    return this.getSFR(SFR.TL0);
  }
  public set tl0(val: number) {
    this.setSFR(SFR.TL0, val);
  }

  public get th0(): number {
    return this.getSFR(SFR.TH0);
  }
  public set th0(val: number) {
    this.setSFR(SFR.TH0, val);
  }

  public get tl1(): number {
    return this.getSFR(SFR.TL1);
  }
  public set tl1(val: number) {
    this.setSFR(SFR.TL1, val);
  }

  public get th1(): number {
    return this.getSFR(SFR.TH1);
  }
  public set th1(val: number) {
    this.setSFR(SFR.TH1, val);
  }

  public get ie(): number {
    return this.getSFR(SFR.IE);
  }
  public set ie(val: number) {
    this.setSFR(SFR.IE, val);
  }

  public get ip(): number {
    return this.getSFR(SFR.IP);
  }
  public set ip(val: number) {
    this.setSFR(SFR.IP, val);
  }

  // --- Interrupt Latch Helpers ---

  /** Returns true if any interrupt is currently being serviced */
  public get isInterruptActive(): boolean {
    return this.inServiceHigh || this.inServiceLow;
  }

  /** Returns true if a high-priority interrupt is currently in service */
  public get isInterruptHighActive(): boolean {
    return this.inServiceHigh;
  }

  /** Returns true if a low-priority interrupt is currently in service */
  public get isInterruptLowActive(): boolean {
    return this.inServiceLow;
  }

  /**
   * Clears the highest active interrupt-in-service priority latch upon RETI (opcode 0x32).
   */
  public clearInterruptLatch(): void {
    const prio = this.isrPriorityStack.pop();
    if (prio === 1) {
      this.inServiceHigh = false;
    } else if (prio === 0) {
      this.inServiceLow = false;
    } else {
      this.inServiceHigh = false;
      this.inServiceLow = false;
    }
  }

  // --- Flag Helpers ---

  public getFlag(mask: number): boolean {
    return (this.psw & mask) !== 0;
  }

  public setFlag(mask: number, set: boolean): void {
    const current = this.psw;
    this.psw = set ? (current | mask) : (current & ~mask);
  }

  // --- Register Banks (R0 - R7) ---

  /** Currently selected register bank (0 to 3), determined by PSW bits RS0 and RS1 */
  public get bank(): number {
    return (this.psw >> 3) & 0x03;
  }

  /** Base address in internal RAM for the active register bank */
  public get bankBase(): number {
    return this.bank * 8;
  }

  public getRegister(n: number): number {
    return this.ram[this.bankBase + (n & 7)];
  }

  public setRegister(n: number, val: number): void {
    this.ram[this.bankBase + (n & 7)] = val & 0xFF;
  }

  // --- Direct and Indirect Memory Addressing ---

  /**
   * Reads from direct address space:
   * - 0x00 - 0x7F: Internal RAM
   * - 0x80 - 0xFF: SFR space
   */
  public readDirect(address: number): number {
    address &= 0xFF;
    if (address < 0x80) {
      return this.ram[address];
    }
    return this.getSFR(address);
  }

  /**
   * Writes to direct address space:
   * - 0x00 - 0x7F: Internal RAM
   * - 0x80 - 0xFF: SFR space
   */
  public writeDirect(address: number, val: number): void {
    address &= 0xFF;
    val &= 0xFF;
    if (address < 0x80) {
      this.ram[address] = val;
    } else {
      this.setSFR(address, val);
    }
  }

  /**
   * Reads from indirect address (@R0 or @R1).
   * Accesses internal RAM across the entire 0x00 - 0xFF address range.
   */
  public readIndirect(ri: number): number {
    const ptr = this.getRegister(ri & 1);
    return this.ram[ptr];
  }

  /**
   * Writes to indirect address (@R0 or @R1).
   * Accesses internal RAM across the entire 0x00 - 0xFF address range.
   */
  public writeIndirect(ri: number, val: number): void {
    const ptr = this.getRegister(ri & 1);
    this.ram[ptr] = val & 0xFF;
  }

  // --- Bit Addressing ---

  /**
   * Reads a bit from the 8051 bit-addressable memory:
   * - 0x00 - 0x7F: RAM addresses 0x20 - 0x2F
   * - 0x80 - 0xFF: Bit-addressable SFRs (0x80, 0x88, 0x90, ..., 0xF0)
   */
  public getBit(bitAddr: number): boolean {
    bitAddr &= 0xFF;
    if (bitAddr < 0x80) {
      const byteAddr = 0x20 + (bitAddr >> 3);
      const bitIndex = bitAddr & 0x07;
      return ((this.ram[byteAddr] >> bitIndex) & 1) === 1;
    } else {
      const sfrAddr = bitAddr & 0xF8;
      const bitIndex = bitAddr & 0x07;
      return ((this.getSFR(sfrAddr) >> bitIndex) & 1) === 1;
    }
  }

  /**
   * Writes a bit to the 8051 bit-addressable memory.
   */
  public setBit(bitAddr: number, value: boolean): void {
    bitAddr &= 0xFF;
    if (bitAddr < 0x80) {
      const byteAddr = 0x20 + (bitAddr >> 3);
      const bitIndex = bitAddr & 0x07;
      if (value) {
        this.ram[byteAddr] |= (1 << bitIndex);
      } else {
        this.ram[byteAddr] &= ~(1 << bitIndex);
      }
    } else {
      const sfrAddr = bitAddr & 0xF8;
      const bitIndex = bitAddr & 0x07;
      let val = this.getSFR(sfrAddr);
      if (value) {
        val |= (1 << bitIndex);
      } else {
        val &= ~(1 << bitIndex);
      }
      this.setSFR(sfrAddr, val);
    }
  }

  // --- Stack Operations ---

  public push(val: number): void {
    this.sp = (this.sp + 1) & 0xFF;
    this.ram[this.sp] = val & 0xFF;
  }

  public pop(): number {
    const val = this.ram[this.sp];
    this.sp = (this.sp - 1) & 0xFF;
    return val;
  }

  // --- Program Execution ---

  /**
   * Loads machine code into code memory (ROM).
   */
  public loadProgram(code: ArrayLike<number>, startAddress: number = 0): void {
    for (let i = 0; i < code.length; i++) {
      this.rom[(startAddress + i) & 0xFFFF] = code[i] & 0xFF;
    }
  }

  /**
   * Fetches the next byte from ROM and increments PC (16-bit wrap).
   */
  public fetchCode(): number {
    const byte = this.rom[this.pc];
    this.pc = (this.pc + 1) & 0xFFFF;
    return byte;
  }

  /**
   * Advances hardware peripherals by the specified number of elapsed machine cycles.
   * @param cycles Number of machine cycles consumed (typically 1, 2, or 4).
   */
  public tickPeripherals(cycles: number): void {
    if (cycles <= 0) return;
    this.tickTimers(cycles);
  }

  /**
   * Advances Timer 0 and Timer 1 counters according to their mode and run bits.
   * - Mode 1: 16-bit counter (TLx + THx cascading)
   * - Mode 2: 8-bit auto-reload from THx to TLx
   */
  private tickTimers(cycles: number): void {
    const tcon = this.getSFR(SFR.TCON);
    const tmod = this.getSFR(SFR.TMOD);

    // --- Timer 0 ---
    const tr0 = (tcon & 0x10) !== 0; // Bit 4 of TCON (TR0)
    const ct0 = (tmod & 0x04) !== 0; // Bit 2 of TMOD (0 = Timer, 1 = Counter)
    if (tr0 && !ct0) {
      const mode0 = tmod & 0x03;
      let tl0 = this.getSFR(SFR.TL0);
      let th0 = this.getSFR(SFR.TH0);
      let tf0 = (tcon & 0x20) !== 0;

      for (let i = 0; i < cycles; i++) {
        if (mode0 === 1) {
          // Mode 1: 16-bit counter
          tl0 = (tl0 + 1) & 0xFF;
          if (tl0 === 0) {
            th0 = (th0 + 1) & 0xFF;
            if (th0 === 0) {
              tf0 = true;
            }
          }
        } else if (mode0 === 2) {
          // Mode 2: 8-bit auto-reload from TH0 to TL0
          tl0 = (tl0 + 1) & 0xFF;
          if (tl0 === 0) {
            tl0 = th0;
            tf0 = true;
          }
        } else if (mode0 === 0) {
          // Mode 0: 13-bit counter (lower 5 bits of TL0, 8 bits of TH0)
          tl0 = (tl0 + 1) & 0x1F;
          if (tl0 === 0) {
            th0 = (th0 + 1) & 0xFF;
            if (th0 === 0) {
              tf0 = true;
            }
          }
        }
      }

      this.setSFR(SFR.TL0, tl0);
      this.setSFR(SFR.TH0, th0);
      if (tf0) {
        this.setSFR(SFR.TCON, this.getSFR(SFR.TCON) | 0x20);
      }
    }

    // --- Timer 1 ---
    const tr1 = (tcon & 0x40) !== 0; // Bit 6 of TCON (TR1)
    const ct1 = (tmod & 0x40) !== 0; // Bit 6 of TMOD (0 = Timer, 1 = Counter)
    if (tr1 && !ct1) {
      const mode1 = (tmod >> 4) & 0x03;
      let tl1 = this.getSFR(SFR.TL1);
      let th1 = this.getSFR(SFR.TH1);
      let tf1 = (tcon & 0x80) !== 0;

      for (let i = 0; i < cycles; i++) {
        if (mode1 === 1) {
          // Mode 1: 16-bit counter
          tl1 = (tl1 + 1) & 0xFF;
          if (tl1 === 0) {
            th1 = (th1 + 1) & 0xFF;
            if (th1 === 0) {
              tf1 = true;
            }
          }
        } else if (mode1 === 2) {
          // Mode 2: 8-bit auto-reload from TH1 to TL1
          tl1 = (tl1 + 1) & 0xFF;
          if (tl1 === 0) {
            tl1 = th1;
            tf1 = true;
          }
        } else if (mode1 === 0) {
          // Mode 0: 13-bit counter
          tl1 = (tl1 + 1) & 0x1F;
          if (tl1 === 0) {
            th1 = (th1 + 1) & 0xFF;
            if (th1 === 0) {
              tf1 = true;
            }
          }
        }
      }

      this.setSFR(SFR.TL1, tl1);
      this.setSFR(SFR.TH1, th1);
      if (tf1) {
        this.setSFR(SFR.TCON, this.getSFR(SFR.TCON) | 0x80);
      }
    }
  }

  /**
   * Checks for pending enabled interrupts and services the highest priority one.
   * If serviced:
   * - Pushes current PC to stack (SP += 2).
   * - Clears hardware request flag (TF0 / TF1).
   * - Sets internal interrupt-in-service latch.
   * - Jumps to vector.
   * @returns Machine cycles consumed by interrupt dispatch (2 if serviced, 0 if none).
   */
  public checkAndServiceInterrupts(): number {
    const ie = this.getSFR(SFR.IE);
    // Global interrupt enable check: EA (IE.7) must be 1
    if ((ie & 0x80) === 0) {
      return 0;
    }

    const tcon = this.getSFR(SFR.TCON);
    const ip = this.getSFR(SFR.IP);

    interface InterruptCandidate {
      name: string;
      vector: number;
      pending: boolean;
      priority: number;
      clearFlag: () => void;
      naturalOrder: number;
    }

    const sources: InterruptCandidate[] = [
      {
        name: 'Timer 0',
        vector: 0x000B,
        pending: (tcon & 0x20) !== 0 && (ie & 0x02) !== 0,
        priority: (ip & 0x02) !== 0 ? 1 : 0,
        clearFlag: () => {
          this.setSFR(SFR.TCON, this.getSFR(SFR.TCON) & ~0x20);
        },
        naturalOrder: 1,
      },
      {
        name: 'Timer 1',
        vector: 0x001B,
        pending: (tcon & 0x80) !== 0 && (ie & 0x08) !== 0,
        priority: (ip & 0x08) !== 0 ? 1 : 0,
        clearFlag: () => {
          this.setSFR(SFR.TCON, this.getSFR(SFR.TCON) & ~0x80);
        },
        naturalOrder: 2,
      },
    ];

    const eligible = sources.filter((s) => {
      if (!s.pending) return false;
      if (this.inServiceHigh) {
        return false;
      }
      if (this.inServiceLow) {
        return s.priority === 1;
      }
      return true;
    });

    if (eligible.length === 0) {
      return 0;
    }

    // Sort: high priority first (1 before 0); for same priority, lower naturalOrder first
    eligible.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.naturalOrder - b.naturalOrder;
    });

    const chosen = eligible[0];

    // Push current PC to stack (low byte then high byte, SP += 2)
    this.push(this.pc & 0xFF);
    this.push((this.pc >> 8) & 0xFF);

    // Clear request flag
    chosen.clearFlag();

    // Set internal interrupt latch
    if (chosen.priority === 1) {
      this.inServiceHigh = true;
    } else {
      this.inServiceLow = true;
    }
    this.isrPriorityStack.push(chosen.priority);

    // Jump to vector
    this.pc = chosen.vector;

    // 8051 hardware interrupt acknowledgment consumes 2 machine cycles
    return 2;
  }

  /**
   * Executes a single instruction step (or services a pending interrupt).
   * Dispatches the instruction via the 256-element jump table.
   * Passes elapsed cycles to tickPeripherals().
   * @returns Object containing the exact number of CPU cycles consumed (1, 2, or 4).
   */
  public step(): StepResult {
    // 1. Check pending interrupts at the start of step()
    const interruptCycles = this.checkAndServiceInterrupts();
    if (interruptCycles > 0) {
      this.tickPeripherals(interruptCycles);
      return { cycles: interruptCycles };
    }

    // 2. Fetch and execute next instruction
    const pcBefore = this.pc;
    const opcode = this.fetchCode();
    const handler = this.jumpTable[opcode];

    if (!handler) {
      throw new Error(
        `Unimplemented opcode 0x${opcode.toString(16).toUpperCase().padStart(2, '0')} at PC 0x${pcBefore
          .toString(16)
          .toUpperCase()
          .padStart(4, '0')}`
      );
    }

    const cycles = handler(this, opcode);
    this.tickPeripherals(cycles);
    return { cycles };
  }

  // --- Arithmetic Helpers used by Opcode Handlers ---

  public execAdd(operand: number, carryIn: number = 0): void {
    const { result, cy, ac, ov } = calculateAddFlags(this.acc, operand, carryIn);
    this.setFlag(PSW_MASK.CY, cy);
    this.setFlag(PSW_MASK.AC, ac);
    this.setFlag(PSW_MASK.OV, ov);
    this.acc = result; // acc assignment automatically updates Parity bit (P)
  }

  public execSubb(operand: number): void {
    const carryIn = this.getFlag(PSW_MASK.CY) ? 1 : 0;
    const { result, cy, ac, ov } = calculateSubbFlags(this.acc, operand, carryIn);
    this.setFlag(PSW_MASK.CY, cy);
    this.setFlag(PSW_MASK.AC, ac);
    this.setFlag(PSW_MASK.OV, ov);
    this.acc = result; // acc assignment automatically updates Parity bit (P)
  }
}
