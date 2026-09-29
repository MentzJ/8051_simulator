/**
 * Accurate PSW Flag Calculations for the 8051 CPU Architecture.
 */

/**
 * Computes the parity of the ACC register.
 * 8051 definition: Parity bit (P, PSW.0) is set to 1 if ACC contains
 * an odd number of set bits (odd parity), and cleared to 0 if it contains
 * an even number of set bits.
 */
export function computeParity(acc: number): number {
  let v = acc & 0xFF;
  v ^= v >> 4;
  v ^= v >> 2;
  v ^= v >> 1;
  return v & 1;
}

export interface ArithmeticFlags {
  result: number;
  cy: boolean;
  ac: boolean;
  ov: boolean;
}

/**
 * Calculates result and flags for 8051 ADD/ADDC operations.
 * - CY: Carry out of bit 7
 * - AC: Auxiliary carry out of bit 3 (BCD carry)
 * - OV: Signed two's complement overflow (carry into bit 7 != carry out of bit 7)
 */
export function calculateAddFlags(a: number, b: number, carryIn: number = 0): ArithmeticFlags {
  a &= 0xFF;
  b &= 0xFF;
  const cin = carryIn ? 1 : 0;
  const sum = a + b + cin;
  const result = sum & 0xFF;

  const cy = sum > 0xFF;
  const ac = ((a & 0x0F) + (b & 0x0F) + cin) > 0x0F;
  const carry6 = ((a & 0x7F) + (b & 0x7F) + cin) > 0x7F;
  const ov = (carry6 ? 1 : 0) !== (cy ? 1 : 0);

  return { result, cy, ac, ov };
}

/**
 * Calculates result and flags for 8051 SUBB operation (A - src - CY).
 * - CY: Borrow needed from bit 7 (A < src + borrowIn)
 * - AC: Borrow needed from bit 3 ((A & 0x0F) < (src & 0x0F) + borrowIn)
 * - OV: Signed borrow overflow (borrow into bit 7 != borrow out of bit 7)
 */
export function calculateSubbFlags(a: number, b: number, borrowIn: number = 0): ArithmeticFlags {
  a &= 0xFF;
  b &= 0xFF;
  const bin = borrowIn ? 1 : 0;
  const diff = a - b - bin;
  const result = diff & 0xFF;

  const cy = diff < 0;
  const ac = ((a & 0x0F) - (b & 0x0F) - bin) < 0;
  const borrow6 = ((a & 0x7F) - (b & 0x7F) - bin) < 0;
  const ov = (borrow6 ? 1 : 0) !== (cy ? 1 : 0);

  return { result, cy, ac, ov };
}
