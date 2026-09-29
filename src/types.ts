/**
 * Special Function Register (SFR) standard addresses in the 8051 architecture.
 * Addresses span 0x80 - 0xFF.
 */
export const SFR = {
  P0: 0x80,
  SP: 0x81,
  DPL: 0x82,
  DPH: 0x83,
  PCON: 0x87,
  TCON: 0x88,
  TMOD: 0x89,
  TL0: 0x8A,
  TL1: 0x8B,
  TH0: 0x8C,
  TH1: 0x8D,
  P1: 0x90,
  SCON: 0x98,
  SBUF: 0x99,
  P2: 0xA0,
  IE: 0xA8,
  P3: 0xB0,
  IP: 0xB8,
  PSW: 0xD0,
  ACC: 0xE0,
  B: 0xF0,
} as const;

export type SFRAddress = (typeof SFR)[keyof typeof SFR] | number;

/**
 * Program Status Word (PSW) Bit Masks
 */
export const PSW_MASK = {
  P: 0x01,   // Bit 0: Parity flag (1 if ACC has odd number of set bits)
  F1: 0x02,  // Bit 1: User-definable flag 1
  OV: 0x04,  // Bit 2: Overflow flag
  RS0: 0x08, // Bit 3: Register Bank Select 0
  RS1: 0x10, // Bit 4: Register Bank Select 1
  F0: 0x20,  // Bit 5: User-definable flag 0
  AC: 0x40,  // Bit 6: Auxiliary Carry flag (carry from bit 3 to 4)
  CY: 0x80,  // Bit 7: Carry flag (carry from bit 7)
} as const;

export interface StepResult {
  cycles: number;
}
