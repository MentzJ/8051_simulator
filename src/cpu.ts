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
   * Executes a single instruction step.
   * Dispatches the instruction via the 256-element jump table.
   * @returns Object containing the number of CPU cycles consumed by the instruction.
   */
  public step(): StepResult {
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
