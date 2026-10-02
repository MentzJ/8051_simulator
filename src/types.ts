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

/**
 * TCON (Timer/Counter Control) Bit Masks (Address 0x88)
 */
export const TCON_MASK = {
  IT0: 0x01, // Bit 0: Interrupt 0 type control bit
  IE0: 0x02, // Bit 1: Interrupt 0 edge flag
  IT1: 0x04, // Bit 2: Interrupt 1 type control bit
  IE1: 0x08, // Bit 3: Interrupt 1 edge flag
  TR0: 0x10, // Bit 4: Timer 0 run control bit (1 = run)
  TF0: 0x20, // Bit 5: Timer 0 overflow flag
  TR1: 0x40, // Bit 6: Timer 1 run control bit (1 = run)
  TF1: 0x80, // Bit 7: Timer 1 overflow flag
} as const;

/**
 * TMOD (Timer/Counter Mode) Bit Masks (Address 0x89)
 */
export const TMOD_MASK = {
  T0_M0: 0x01,   // Bit 0: Timer 0 mode bit 0
  T0_M1: 0x02,   // Bit 1: Timer 0 mode bit 1
  T0_CT: 0x04,   // Bit 2: Timer 0 Counter/Timer select (0=Timer, 1=Counter)
  T0_GATE: 0x08, // Bit 3: Timer 0 Gate control
  T1_M0: 0x10,   // Bit 4: Timer 1 mode bit 0
  T1_M1: 0x20,   // Bit 5: Timer 1 mode bit 1
  T1_CT: 0x40,   // Bit 6: Timer 1 Counter/Timer select (0=Timer, 1=Counter)
  T1_GATE: 0x80, // Bit 7: Timer 1 Gate control
} as const;

/**
 * IE (Interrupt Enable) Bit Masks (Address 0xA8)
 */
export const IE_MASK = {
  EX0: 0x01, // Bit 0: External Interrupt 0 Enable
  ET0: 0x02, // Bit 1: Timer 0 Interrupt Enable
  EX1: 0x04, // Bit 2: External Interrupt 1 Enable
  ET1: 0x08, // Bit 3: Timer 1 Interrupt Enable
  ES:  0x10, // Bit 4: Serial Port Interrupt Enable
  ET2: 0x20, // Bit 5: Timer 2 Interrupt Enable (8052)
  EA:  0x80, // Bit 7: Global Interrupt Enable (1 = enabled)
} as const;

/**
 * IP (Interrupt Priority) Bit Masks (Address 0xB8)
 */
export const IP_MASK = {
  PX0: 0x01, // Bit 0: External Interrupt 0 Priority
  PT0: 0x02, // Bit 1: Timer 0 Priority
  PX1: 0x04, // Bit 2: External Interrupt 1 Priority
  PT1: 0x08, // Bit 3: Timer 1 Priority
  PS:  0x10, // Bit 4: Serial Port Priority
  PT2: 0x20, // Bit 5: Timer 2 Priority (8052)
} as const;

/**
 * SCON (Serial Control) Bit Masks (Address 0x98)
 */
export const SCON_MASK = {
  RI:  0x01, // Bit 0: Receive Interrupt flag (set when byte received)
  TI:  0x02, // Bit 1: Transmit Interrupt flag (set when byte sent)
  RB8: 0x04, // Bit 2: 9th receive bit in modes 2 & 3
  TB8: 0x08, // Bit 3: 9th transmit bit in modes 2 & 3
  REN: 0x10, // Bit 4: Receiver Enable (1 = enabled)
  SM2: 0x20, // Bit 5: Multiprocessor communication enable
  SM1: 0x40, // Bit 6: Serial Port Mode bit 1
  SM0: 0x80, // Bit 7: Serial Port Mode bit 0
} as const;

/**
 * PCON (Power Control) Bit Masks (Address 0x87)
 */
export const PCON_MASK = {
  IDL:  0x01, // Bit 0: Idle mode bit
  PD:   0x02, // Bit 1: Power Down mode bit
  GF0:  0x04, // Bit 2: General purpose flag 0
  GF1:  0x08, // Bit 3: General purpose flag 1
  SMOD: 0x80, // Bit 7: Double Baud rate bit
} as const;

export interface StepResult {
  cycles: number;
}
