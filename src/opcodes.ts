import type { CPU8051 } from './cpu.js';
import { PSW_MASK } from './types.js';

export type OpcodeHandler = (cpu: CPU8051, opcode: number) => number;

/**
 * Builds and returns the 256-element jump table for 8051 opcode execution.
 */
export function buildOpcodeTable(): OpcodeHandler[] {
  const table: OpcodeHandler[] = new Array(256);

  // Helper for signed 8-bit branch offset
  const fetchRel = (cpu: CPU8051): number => {
    const rel = cpu.fetchCode();
    return rel >= 128 ? rel - 256 : rel;
  };

  // ----------------------------------------------------
  // 1. Control / NOP / Jumps
  // ----------------------------------------------------

  // NOP: 0x00 (1 byte, 1 cycle)
  table[0x00] = () => 1;

  // LJMP addr16: 0x02 (3 bytes, 2 cycles)
  table[0x02] = (cpu) => {
    const high = cpu.fetchCode();
    const low = cpu.fetchCode();
    cpu.pc = (high << 8) | low;
    return 2;
  };

  // AJMP addr11: 0x01, 0x21, 0x41, 0x61, 0x81, 0xA1, 0xC1, 0xE1 (2 bytes, 2 cycles)
  for (let page = 0; page < 8; page++) {
    const op = (page << 5) | 0x01;
    table[op] = (cpu, opcode) => {
      const addrLow = cpu.fetchCode();
      const target = (cpu.pc & 0xF800) | ((opcode & 0xE0) << 3) | addrLow;
      cpu.pc = target;
      return 2;
    };
  }

  // SJMP rel: 0x80 (2 bytes, 2 cycles)
  table[0x80] = (cpu) => {
    const rel = fetchRel(cpu);
    cpu.pc = (cpu.pc + rel) & 0xFFFF;
    return 2;
  };

  // JZ rel: 0x60 (2 bytes, 2 cycles)
  table[0x60] = (cpu) => {
    const rel = fetchRel(cpu);
    if (cpu.acc === 0) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // JNZ rel: 0x70 (2 bytes, 2 cycles)
  table[0x70] = (cpu) => {
    const rel = fetchRel(cpu);
    if (cpu.acc !== 0) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // JC rel: 0x40 (2 bytes, 2 cycles)
  table[0x40] = (cpu) => {
    const rel = fetchRel(cpu);
    if (cpu.getFlag(PSW_MASK.CY)) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // JNC rel: 0x50 (2 bytes, 2 cycles)
  table[0x50] = (cpu) => {
    const rel = fetchRel(cpu);
    if (!cpu.getFlag(PSW_MASK.CY)) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // JB bit, rel: 0x20 (3 bytes, 2 cycles)
  table[0x20] = (cpu) => {
    const bit = cpu.fetchCode();
    const rel = fetchRel(cpu);
    if (cpu.getBit(bit)) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // JNB bit, rel: 0x30 (3 bytes, 2 cycles)
  table[0x30] = (cpu) => {
    const bit = cpu.fetchCode();
    const rel = fetchRel(cpu);
    if (!cpu.getBit(bit)) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // JBC bit, rel: 0x10 (3 bytes, 2 cycles)
  table[0x10] = (cpu) => {
    const bit = cpu.fetchCode();
    const rel = fetchRel(cpu);
    if (cpu.getBit(bit)) {
      cpu.setBit(bit, false);
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // ----------------------------------------------------
  // 2. Call and Return
  // ----------------------------------------------------

  // LCALL addr16: 0x12 (3 bytes, 2 cycles)
  table[0x12] = (cpu) => {
    const high = cpu.fetchCode();
    const low = cpu.fetchCode();
    cpu.push(cpu.pc & 0xFF);
    cpu.push((cpu.pc >> 8) & 0xFF);
    cpu.pc = (high << 8) | low;
    return 2;
  };

  // ACALL addr11: 0x11, 0x31, 0x51, 0x71, 0x91, 0xB1, 0xD1, 0xF1 (2 bytes, 2 cycles)
  for (let page = 0; page < 8; page++) {
    const op = (page << 5) | 0x11;
    table[op] = (cpu, opcode) => {
      const addrLow = cpu.fetchCode();
      const target = (cpu.pc & 0xF800) | ((opcode & 0xE0) << 3) | addrLow;
      cpu.push(cpu.pc & 0xFF);
      cpu.push((cpu.pc >> 8) & 0xFF);
      cpu.pc = target;
      return 2;
    };
  }

  // RET: 0x22 (1 byte, 2 cycles)
  table[0x22] = (cpu) => {
    const high = cpu.pop();
    const low = cpu.pop();
    cpu.pc = (high << 8) | low;
    return 2;
  };

  // RETI: 0x32 (1 byte, 2 cycles) - Return from interrupt (pops PC & clears interrupt latch)
  table[0x32] = (cpu) => {
    const high = cpu.pop();
    const low = cpu.pop();
    cpu.pc = (high << 8) | low;
    cpu.clearInterruptLatch();
    return 2;
  };

  // ----------------------------------------------------
  // 3. Stack (PUSH / POP)
  // ----------------------------------------------------

  // PUSH direct: 0xC0 (2 bytes, 2 cycles)
  table[0xC0] = (cpu) => {
    const addr = cpu.fetchCode();
    cpu.push(cpu.readDirect(addr));
    return 2;
  };

  // POP direct: 0xD0 (2 bytes, 2 cycles)
  table[0xD0] = (cpu) => {
    const addr = cpu.fetchCode();
    cpu.writeDirect(addr, cpu.pop());
    return 2;
  };

  // ----------------------------------------------------
  // 4. MOV Instructions
  // ----------------------------------------------------

  // MOV A, #data: 0x74 (2 bytes, 1 cycle)
  table[0x74] = (cpu) => {
    cpu.acc = cpu.fetchCode();
    return 1;
  };

  // MOV A, direct: 0xE5 (2 bytes, 1 cycle)
  table[0xE5] = (cpu) => {
    cpu.acc = cpu.readDirect(cpu.fetchCode());
    return 1;
  };

  // MOV A, @R0 / @R1: 0xE6, 0xE7 (1 byte, 1 cycle)
  table[0xE6] = (cpu) => {
    cpu.acc = cpu.readIndirect(0);
    return 1;
  };
  table[0xE7] = (cpu) => {
    cpu.acc = cpu.readIndirect(1);
    return 1;
  };

  // MOV A, Rn: 0xE8 - 0xEF (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0xE8 + r] = (cpu, opcode) => {
      cpu.acc = cpu.getRegister(opcode & 7);
      return 1;
    };
  }

  // MOV Rn, #data: 0x78 - 0x7F (2 bytes, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0x78 + r] = (cpu, opcode) => {
      cpu.setRegister(opcode & 7, cpu.fetchCode());
      return 1;
    };
  }

  // MOV Rn, direct: 0xA8 - 0xAF (2 bytes, 2 cycles)
  for (let r = 0; r < 8; r++) {
    table[0xA8 + r] = (cpu, opcode) => {
      const addr = cpu.fetchCode();
      cpu.setRegister(opcode & 7, cpu.readDirect(addr));
      return 2;
    };
  }

  // MOV Rn, A: 0xF8 - 0xFF (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0xF8 + r] = (cpu, opcode) => {
      cpu.setRegister(opcode & 7, cpu.acc);
      return 1;
    };
  }

  // MOV direct, #data: 0x75 (3 bytes, 2 cycles)
  table[0x75] = (cpu) => {
    const addr = cpu.fetchCode();
    const val = cpu.fetchCode();
    cpu.writeDirect(addr, val);
    return 2;
  };

  // MOV direct, direct: 0x85 (3 bytes, 2 cycles) - NOTE: In 8051, src byte comes before dest byte
  table[0x85] = (cpu) => {
    const src = cpu.fetchCode();
    const dest = cpu.fetchCode();
    cpu.writeDirect(dest, cpu.readDirect(src));
    return 2;
  };

  // MOV direct, @R0 / @R1: 0x86, 0x87 (2 bytes, 2 cycles)
  table[0x86] = (cpu) => {
    const dest = cpu.fetchCode();
    cpu.writeDirect(dest, cpu.readIndirect(0));
    return 2;
  };
  table[0x87] = (cpu) => {
    const dest = cpu.fetchCode();
    cpu.writeDirect(dest, cpu.readIndirect(1));
    return 2;
  };

  // MOV direct, Rn: 0x88 - 0x8F (2 bytes, 2 cycles)
  for (let r = 0; r < 8; r++) {
    table[0x88 + r] = (cpu, opcode) => {
      const dest = cpu.fetchCode();
      cpu.writeDirect(dest, cpu.getRegister(opcode & 7));
      return 2;
    };
  }

  // MOV direct, A: 0xF5 (2 bytes, 1 cycle)
  table[0xF5] = (cpu) => {
    const dest = cpu.fetchCode();
    cpu.writeDirect(dest, cpu.acc);
    return 1;
  };

  // MOV @R0 / @R1, #data: 0x76, 0x77 (2 bytes, 1 cycle)
  table[0x76] = (cpu) => {
    const val = cpu.fetchCode();
    cpu.writeIndirect(0, val);
    return 1;
  };
  table[0x77] = (cpu) => {
    const val = cpu.fetchCode();
    cpu.writeIndirect(1, val);
    return 1;
  };

  // MOV @R0 / @R1, direct: 0xA6, 0xA7 (2 bytes, 2 cycles)
  table[0xA6] = (cpu) => {
    const src = cpu.fetchCode();
    cpu.writeIndirect(0, cpu.readDirect(src));
    return 2;
  };
  table[0xA7] = (cpu) => {
    const src = cpu.fetchCode();
    cpu.writeIndirect(1, cpu.readDirect(src));
    return 2;
  };

  // MOV @R0 / @R1, A: 0xF6, 0xF7 (1 byte, 1 cycle)
  table[0xF6] = (cpu) => {
    cpu.writeIndirect(0, cpu.acc);
    return 1;
  };
  table[0xF7] = (cpu) => {
    cpu.writeIndirect(1, cpu.acc);
    return 1;
  };

  // MOV DPTR, #data16: 0x90 (3 bytes, 2 cycles)
  table[0x90] = (cpu) => {
    const high = cpu.fetchCode();
    const low = cpu.fetchCode();
    cpu.dptr = (high << 8) | low;
    return 2;
  };

  // MOV C, bit: 0xA2 (2 bytes, 1 cycle)
  table[0xA2] = (cpu) => {
    const bit = cpu.fetchCode();
    cpu.setFlag(PSW_MASK.CY, cpu.getBit(bit));
    return 1;
  };

  // MOV bit, C: 0x92 (2 bytes, 2 cycles)
  table[0x92] = (cpu) => {
    const bit = cpu.fetchCode();
    cpu.setBit(bit, cpu.getFlag(PSW_MASK.CY));
    return 2;
  };

  // ----------------------------------------------------
  // 5. ADD Instructions
  // ----------------------------------------------------

  // ADD A, #data: 0x24 (2 bytes, 1 cycle)
  table[0x24] = (cpu) => {
    cpu.execAdd(cpu.fetchCode(), 0);
    return 1;
  };

  // ADD A, direct: 0x25 (2 bytes, 1 cycle)
  table[0x25] = (cpu) => {
    cpu.execAdd(cpu.readDirect(cpu.fetchCode()), 0);
    return 1;
  };

  // ADD A, @R0 / @R1: 0x26, 0x27 (1 byte, 1 cycle)
  table[0x26] = (cpu) => {
    cpu.execAdd(cpu.readIndirect(0), 0);
    return 1;
  };
  table[0x27] = (cpu) => {
    cpu.execAdd(cpu.readIndirect(1), 0);
    return 1;
  };

  // ADD A, Rn: 0x28 - 0x2F (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0x28 + r] = (cpu, opcode) => {
      cpu.execAdd(cpu.getRegister(opcode & 7), 0);
      return 1;
    };
  }

  // ----------------------------------------------------
  // 6. ADDC Instructions (Add with Carry)
  // ----------------------------------------------------

  // ADDC A, #data: 0x34 (2 bytes, 1 cycle)
  table[0x34] = (cpu) => {
    const carry = cpu.getFlag(PSW_MASK.CY) ? 1 : 0;
    cpu.execAdd(cpu.fetchCode(), carry);
    return 1;
  };

  // ADDC A, direct: 0x35 (2 bytes, 1 cycle)
  table[0x35] = (cpu) => {
    const carry = cpu.getFlag(PSW_MASK.CY) ? 1 : 0;
    cpu.execAdd(cpu.readDirect(cpu.fetchCode()), carry);
    return 1;
  };

  // ADDC A, @R0 / @R1: 0x36, 0x37 (1 byte, 1 cycle)
  table[0x36] = (cpu) => {
    const carry = cpu.getFlag(PSW_MASK.CY) ? 1 : 0;
    cpu.execAdd(cpu.readIndirect(0), carry);
    return 1;
  };
  table[0x37] = (cpu) => {
    const carry = cpu.getFlag(PSW_MASK.CY) ? 1 : 0;
    cpu.execAdd(cpu.readIndirect(1), carry);
    return 1;
  };

  // ADDC A, Rn: 0x38 - 0x3F (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0x38 + r] = (cpu, opcode) => {
      const carry = cpu.getFlag(PSW_MASK.CY) ? 1 : 0;
      cpu.execAdd(cpu.getRegister(opcode & 7), carry);
      return 1;
    };
  }

  // ----------------------------------------------------
  // 7. SUBB Instructions (Subtract with Borrow)
  // ----------------------------------------------------

  // SUBB A, #data: 0x94 (2 bytes, 1 cycle)
  table[0x94] = (cpu) => {
    cpu.execSubb(cpu.fetchCode());
    return 1;
  };

  // SUBB A, direct: 0x95 (2 bytes, 1 cycle)
  table[0x95] = (cpu) => {
    cpu.execSubb(cpu.readDirect(cpu.fetchCode()));
    return 1;
  };

  // SUBB A, @R0 / @R1: 0x96, 0x97 (1 byte, 1 cycle)
  table[0x96] = (cpu) => {
    cpu.execSubb(cpu.readIndirect(0));
    return 1;
  };
  table[0x97] = (cpu) => {
    cpu.execSubb(cpu.readIndirect(1));
    return 1;
  };

  // SUBB A, Rn: 0x98 - 0x9F (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0x98 + r] = (cpu, opcode) => {
      cpu.execSubb(cpu.getRegister(opcode & 7));
      return 1;
    };
  }

  // ----------------------------------------------------
  // 8. INC Instructions
  // ----------------------------------------------------

  // INC A: 0x04 (1 byte, 1 cycle)
  table[0x04] = (cpu) => {
    cpu.acc = (cpu.acc + 1) & 0xFF;
    return 1;
  };

  // INC direct: 0x05 (2 bytes, 1 cycle)
  table[0x05] = (cpu) => {
    const addr = cpu.fetchCode();
    cpu.writeDirect(addr, (cpu.readDirect(addr) + 1) & 0xFF);
    return 1;
  };

  // INC @R0 / @R1: 0x06, 0x07 (1 byte, 1 cycle)
  table[0x06] = (cpu) => {
    cpu.writeIndirect(0, (cpu.readIndirect(0) + 1) & 0xFF);
    return 1;
  };
  table[0x07] = (cpu) => {
    cpu.writeIndirect(1, (cpu.readIndirect(1) + 1) & 0xFF);
    return 1;
  };

  // INC Rn: 0x08 - 0x0F (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0x08 + r] = (cpu, opcode) => {
      const reg = opcode & 7;
      cpu.setRegister(reg, (cpu.getRegister(reg) + 1) & 0xFF);
      return 1;
    };
  }

  // INC DPTR: 0xA3 (1 byte, 2 cycles)
  table[0xA3] = (cpu) => {
    cpu.dptr = (cpu.dptr + 1) & 0xFFFF;
    return 2;
  };

  // ----------------------------------------------------
  // 9. DEC Instructions
  // ----------------------------------------------------

  // DEC A: 0x14 (1 byte, 1 cycle)
  table[0x14] = (cpu) => {
    cpu.acc = (cpu.acc - 1) & 0xFF;
    return 1;
  };

  // DEC direct: 0x15 (2 bytes, 1 cycle)
  table[0x15] = (cpu) => {
    const addr = cpu.fetchCode();
    cpu.writeDirect(addr, (cpu.readDirect(addr) - 1) & 0xFF);
    return 1;
  };

  // DEC @R0 / @R1: 0x16, 0x17 (1 byte, 1 cycle)
  table[0x16] = (cpu) => {
    cpu.writeIndirect(0, (cpu.readIndirect(0) - 1) & 0xFF);
    return 1;
  };
  table[0x17] = (cpu) => {
    cpu.writeIndirect(1, (cpu.readIndirect(1) - 1) & 0xFF);
    return 1;
  };

  // DEC Rn: 0x18 - 0x1F (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0x18 + r] = (cpu, opcode) => {
      const reg = opcode & 7;
      cpu.setRegister(reg, (cpu.getRegister(reg) - 1) & 0xFF);
      return 1;
    };
  }

  // ----------------------------------------------------
  // 10. Loops and Comparisons (DJNZ, CJNE)
  // ----------------------------------------------------

  // DJNZ Rn, rel: 0xD8 - 0xDF (2 bytes, 2 cycles)
  for (let r = 0; r < 8; r++) {
    table[0xD8 + r] = (cpu, opcode) => {
      const reg = opcode & 7;
      const rel = fetchRel(cpu);
      const val = (cpu.getRegister(reg) - 1) & 0xFF;
      cpu.setRegister(reg, val);
      if (val !== 0) {
        cpu.pc = (cpu.pc + rel) & 0xFFFF;
      }
      return 2;
    };
  }

  // DJNZ direct, rel: 0xD5 (3 bytes, 2 cycles)
  table[0xD5] = (cpu) => {
    const addr = cpu.fetchCode();
    const rel = fetchRel(cpu);
    const val = (cpu.readDirect(addr) - 1) & 0xFF;
    cpu.writeDirect(addr, val);
    if (val !== 0) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // CJNE A, #data, rel: 0xB4 (3 bytes, 2 cycles)
  table[0xB4] = (cpu) => {
    const data = cpu.fetchCode();
    const rel = fetchRel(cpu);
    cpu.setFlag(PSW_MASK.CY, cpu.acc < data);
    if (cpu.acc !== data) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // CJNE A, direct, rel: 0xB5 (3 bytes, 2 cycles)
  table[0xB5] = (cpu) => {
    const addr = cpu.fetchCode();
    const rel = fetchRel(cpu);
    const val = cpu.readDirect(addr);
    cpu.setFlag(PSW_MASK.CY, cpu.acc < val);
    if (cpu.acc !== val) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // CJNE Rn, #data, rel: 0xB8 - 0xBF (3 bytes, 2 cycles)
  for (let r = 0; r < 8; r++) {
    table[0xB8 + r] = (cpu, opcode) => {
      const data = cpu.fetchCode();
      const rel = fetchRel(cpu);
      const val = cpu.getRegister(opcode & 7);
      cpu.setFlag(PSW_MASK.CY, val < data);
      if (val !== data) {
        cpu.pc = (cpu.pc + rel) & 0xFFFF;
      }
      return 2;
    };
  }

  // CJNE @Ri, #data, rel: 0xB6, 0xB7 (3 bytes, 2 cycles)
  table[0xB6] = (cpu) => {
    const data = cpu.fetchCode();
    const rel = fetchRel(cpu);
    const val = cpu.readIndirect(0);
    cpu.setFlag(PSW_MASK.CY, val < data);
    if (val !== data) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };
  table[0xB7] = (cpu) => {
    const data = cpu.fetchCode();
    const rel = fetchRel(cpu);
    const val = cpu.readIndirect(1);
    cpu.setFlag(PSW_MASK.CY, val < data);
    if (val !== data) {
      cpu.pc = (cpu.pc + rel) & 0xFFFF;
    }
    return 2;
  };

  // ----------------------------------------------------
  // 11. Logic Operations (CLR, SETB, CPL, ANL, ORL, XRL)
  // ----------------------------------------------------

  // CLR A: 0xE4 (1 byte, 1 cycle)
  table[0xE4] = (cpu) => {
    cpu.acc = 0;
    return 1;
  };

  // CPL A: 0xF4 (1 byte, 1 cycle)
  table[0xF4] = (cpu) => {
    cpu.acc = ~cpu.acc & 0xFF;
    return 1;
  };

  // CLR C: 0xC3 (1 byte, 1 cycle)
  table[0xC3] = (cpu) => {
    cpu.setFlag(PSW_MASK.CY, false);
    return 1;
  };

  // SETB C: 0xD3 (1 byte, 1 cycle)
  table[0xD3] = (cpu) => {
    cpu.setFlag(PSW_MASK.CY, true);
    return 1;
  };

  // CPL C: 0xB3 (1 byte, 1 cycle)
  table[0xB3] = (cpu) => {
    cpu.setFlag(PSW_MASK.CY, !cpu.getFlag(PSW_MASK.CY));
    return 1;
  };

  // CLR bit: 0xC2 (2 bytes, 1 cycle)
  table[0xC2] = (cpu) => {
    cpu.setBit(cpu.fetchCode(), false);
    return 1;
  };

  // SETB bit: 0xD2 (2 bytes, 1 cycle)
  table[0xD2] = (cpu) => {
    cpu.setBit(cpu.fetchCode(), true);
    return 1;
  };

  // CPL bit: 0xB2 (2 bytes, 1 cycle)
  table[0xB2] = (cpu) => {
    const bit = cpu.fetchCode();
    cpu.setBit(bit, !cpu.getBit(bit));
    return 1;
  };

  // ANL A, #data: 0x54 (2 bytes, 1 cycle)
  table[0x54] = (cpu) => {
    cpu.acc &= cpu.fetchCode();
    return 1;
  };
  // ANL A, direct: 0x55 (2 bytes, 1 cycle)
  table[0x55] = (cpu) => {
    cpu.acc &= cpu.readDirect(cpu.fetchCode());
    return 1;
  };
  // ANL A, @R0 / @R1: 0x56, 0x57 (1 byte, 1 cycle)
  table[0x56] = (cpu) => {
    cpu.acc &= cpu.readIndirect(0);
    return 1;
  };
  table[0x57] = (cpu) => {
    cpu.acc &= cpu.readIndirect(1);
    return 1;
  };
  // ANL A, Rn: 0x58 - 0x5F (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0x58 + r] = (cpu, opcode) => {
      cpu.acc &= cpu.getRegister(opcode & 7);
      return 1;
    };
  }
  // ANL direct, A: 0x52 (2 bytes, 1 cycle)
  table[0x52] = (cpu) => {
    const addr = cpu.fetchCode();
    cpu.writeDirect(addr, cpu.readDirect(addr) & cpu.acc);
    return 1;
  };
  // ANL direct, #data: 0x53 (3 bytes, 2 cycles)
  table[0x53] = (cpu) => {
    const addr = cpu.fetchCode();
    const data = cpu.fetchCode();
    cpu.writeDirect(addr, cpu.readDirect(addr) & data);
    return 2;
  };

  // ORL A, #data: 0x44 (2 bytes, 1 cycle)
  table[0x44] = (cpu) => {
    cpu.acc |= cpu.fetchCode();
    return 1;
  };
  // ORL A, direct: 0x45 (2 bytes, 1 cycle)
  table[0x45] = (cpu) => {
    cpu.acc |= cpu.readDirect(cpu.fetchCode());
    return 1;
  };
  // ORL A, @R0 / @R1: 0x46, 0x47 (1 byte, 1 cycle)
  table[0x46] = (cpu) => {
    cpu.acc |= cpu.readIndirect(0);
    return 1;
  };
  table[0x47] = (cpu) => {
    cpu.acc |= cpu.readIndirect(1);
    return 1;
  };
  // ORL A, Rn: 0x48 - 0x4F (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0x48 + r] = (cpu, opcode) => {
      cpu.acc |= cpu.getRegister(opcode & 7);
      return 1;
    };
  }
  // ORL direct, A: 0x42 (2 bytes, 1 cycle)
  table[0x42] = (cpu) => {
    const addr = cpu.fetchCode();
    cpu.writeDirect(addr, cpu.readDirect(addr) | cpu.acc);
    return 1;
  };
  // ORL direct, #data: 0x43 (3 bytes, 2 cycles)
  table[0x43] = (cpu) => {
    const addr = cpu.fetchCode();
    const data = cpu.fetchCode();
    cpu.writeDirect(addr, cpu.readDirect(addr) | data);
    return 2;
  };

  // XRL A, #data: 0x64 (2 bytes, 1 cycle)
  table[0x64] = (cpu) => {
    cpu.acc ^= cpu.fetchCode();
    return 1;
  };
  // XRL A, direct: 0x65 (2 bytes, 1 cycle)
  table[0x65] = (cpu) => {
    cpu.acc ^= cpu.readDirect(cpu.fetchCode());
    return 1;
  };
  // XRL A, @R0 / @R1: 0x66, 0x67 (1 byte, 1 cycle)
  table[0x66] = (cpu) => {
    cpu.acc ^= cpu.readIndirect(0);
    return 1;
  };
  table[0x67] = (cpu) => {
    cpu.acc ^= cpu.readIndirect(1);
    return 1;
  };
  // XRL A, Rn: 0x68 - 0x6F (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0x68 + r] = (cpu, opcode) => {
      cpu.acc ^= cpu.getRegister(opcode & 7);
      return 1;
    };
  }
  // XRL direct, A: 0x62 (2 bytes, 1 cycle)
  table[0x62] = (cpu) => {
    const addr = cpu.fetchCode();
    cpu.writeDirect(addr, cpu.readDirect(addr) ^ cpu.acc);
    return 1;
  };
  // XRL direct, #data: 0x63 (3 bytes, 2 cycles)
  table[0x63] = (cpu) => {
    const addr = cpu.fetchCode();
    const data = cpu.fetchCode();
    cpu.writeDirect(addr, cpu.readDirect(addr) ^ data);
    return 2;
  };

  // ----------------------------------------------------
  // 12. Rotates and Exchanges
  // ----------------------------------------------------

  // RL A: 0x23 (1 byte, 1 cycle)
  table[0x23] = (cpu) => {
    cpu.acc = ((cpu.acc << 1) | (cpu.acc >> 7)) & 0xFF;
    return 1;
  };

  // RLC A: 0x33 (1 byte, 1 cycle)
  table[0x33] = (cpu) => {
    const cy = cpu.getFlag(PSW_MASK.CY) ? 1 : 0;
    const newCy = (cpu.acc & 0x80) !== 0;
    cpu.acc = ((cpu.acc << 1) | cy) & 0xFF;
    cpu.setFlag(PSW_MASK.CY, newCy);
    return 1;
  };

  // RR A: 0x03 (1 byte, 1 cycle)
  table[0x03] = (cpu) => {
    cpu.acc = ((cpu.acc >> 1) | (cpu.acc << 7)) & 0xFF;
    return 1;
  };

  // RRC A: 0x13 (1 byte, 1 cycle)
  table[0x13] = (cpu) => {
    const cy = cpu.getFlag(PSW_MASK.CY) ? 1 : 0;
    const newCy = (cpu.acc & 0x01) !== 0;
    cpu.acc = ((cpu.acc >> 1) | (cy << 7)) & 0xFF;
    cpu.setFlag(PSW_MASK.CY, newCy);
    return 1;
  };

  // SWAP A: 0xC4 (1 byte, 1 cycle)
  table[0xC4] = (cpu) => {
    cpu.acc = ((cpu.acc << 4) | (cpu.acc >> 4)) & 0xFF;
    return 1;
  };

  // XCH A, Rn: 0xC8 - 0xCF (1 byte, 1 cycle)
  for (let r = 0; r < 8; r++) {
    table[0xC8 + r] = (cpu, opcode) => {
      const reg = opcode & 7;
      const tmp = cpu.acc;
      cpu.acc = cpu.getRegister(reg);
      cpu.setRegister(reg, tmp);
      return 1;
    };
  }

  // XCH A, direct: 0xC5 (2 bytes, 1 cycle)
  table[0xC5] = (cpu) => {
    const addr = cpu.fetchCode();
    const tmp = cpu.acc;
    cpu.acc = cpu.readDirect(addr);
    cpu.writeDirect(addr, tmp);
    return 1;
  };

  // XCH A, @R0 / @R1: 0xC6, 0xC7 (1 byte, 1 cycle)
  table[0xC6] = (cpu) => {
    const tmp = cpu.acc;
    cpu.acc = cpu.readIndirect(0);
    cpu.writeIndirect(0, tmp);
    return 1;
  };
  table[0xC7] = (cpu) => {
    const tmp = cpu.acc;
    cpu.acc = cpu.readIndirect(1);
    cpu.writeIndirect(1, tmp);
    return 1;
  };

  // XCHD A, @R0 / @R1: 0xD6, 0xD7 (1 byte, 1 cycle)
  table[0xD6] = (cpu) => {
    const indVal = cpu.readIndirect(0);
    const lowA = cpu.acc & 0x0F;
    const lowInd = indVal & 0x0F;
    cpu.acc = (cpu.acc & 0xF0) | lowInd;
    cpu.writeIndirect(0, (indVal & 0xF0) | lowA);
    return 1;
  };
  table[0xD7] = (cpu) => {
    const indVal = cpu.readIndirect(1);
    const lowA = cpu.acc & 0x0F;
    const lowInd = indVal & 0x0F;
    cpu.acc = (cpu.acc & 0xF0) | lowInd;
    cpu.writeIndirect(1, (indVal & 0xF0) | lowA);
    return 1;
  };

  // ----------------------------------------------------
  // 13. Multiply, Divide, Decimal Adjust
  // ----------------------------------------------------

  // MUL AB: 0xA4 (1 byte, 4 cycles)
  table[0xA4] = (cpu) => {
    const prod = cpu.acc * cpu.b;
    cpu.acc = prod & 0xFF;
    cpu.b = (prod >> 8) & 0xFF;
    cpu.setFlag(PSW_MASK.CY, false);
    cpu.setFlag(PSW_MASK.OV, cpu.b > 0);
    return 4;
  };

  // DIV AB: 0x84 (1 byte, 4 cycles)
  table[0x84] = (cpu) => {
    cpu.setFlag(PSW_MASK.CY, false);
    if (cpu.b === 0) {
      cpu.setFlag(PSW_MASK.OV, true);
    } else {
      cpu.setFlag(PSW_MASK.OV, false);
      const q = Math.floor(cpu.acc / cpu.b);
      const rem = cpu.acc % cpu.b;
      cpu.acc = q;
      cpu.b = rem;
    }
    return 4;
  };

  // DA A: 0xD4 (1 byte, 1 cycle)
  table[0xD4] = (cpu) => {
    let a = cpu.acc;
    let cy = cpu.getFlag(PSW_MASK.CY);
    if ((a & 0x0F) > 9 || cpu.getFlag(PSW_MASK.AC)) {
      a += 0x06;
    }
    if (a > 0x9F || cy) {
      a += 0x60;
      cy = true;
    }
    cpu.acc = a & 0xFF;
    cpu.setFlag(PSW_MASK.CY, cy);
    return 1;
  };

  return table;
}
