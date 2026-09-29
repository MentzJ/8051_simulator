# 8051 Microprocessor Simulator

A cycle-accurate, headless TypeScript emulation core for the Intel 8051 microcontroller architecture.

---

## ⚡ Features

- **Cycle-Accurate Instruction Stepper**: Single-step execution model via `step(): { cycles: number }` dispatched across a 256-element jump table.
- **Complete Memory Architecture**:
  - **Internal RAM (256 bytes)**: Lower 128 bytes (Register Banks 0–3, bit-addressable RAM, scratchpad RAM) and upper 128 bytes (indirect access).
  - **Special Function Registers (128 bytes)**: SFR space mapped from `0x80` to `0xFF`.
  - **Program Memory / ROM (64 KB)**: 16-bit addressable code memory.
- **Dedicated SFR & Register Accessors**:
  - `ACC` (`0xE0`), `B` (`0xF0`), `PSW` (`0xD0`), `SP` (`0x81`, initialized to `0x07`), `DPL` (`0x82`), `DPH` (`0x83`), and 16-bit `DPTR`.
- **Accurate PSW Flags**:
  - **CY (Carry)**: Carry/borrow out of bit 7.
  - **AC (Auxiliary Carry)**: BCD half-carry/borrow out of bit 3.
  - **OV (Overflow)**: Signed two's complement arithmetic overflow.
  - **P (Parity)**: Hardware-accurate odd parity flag dynamically updated whenever ACC changes.
- **Dynamic Register Bank Switching**:
  - Full support for Register Banks 0–3 via PSW bits `RS0` (bit 3) and `RS1` (bit 4), routing `R0`–`R7` and `@R0`/`@R1` to RAM offsets `0x00`, `0x08`, `0x10`, and `0x18`.
- **Bit-Addressable Memory**:
  - RAM bits (`0x00`–`0x7F` mapped to RAM `0x20`–`0x2F`) and SFR bits (`0x80`–`0xFF`).
- **Comprehensive Instruction Support**:
  - **Data Transfer**: `MOV` (immediate, direct, register `Rn`, indirect `@Ri`, 16-bit `DPTR`, bit-to-carry), `PUSH`, `POP`, `XCH`, `XCHD`.
  - **Arithmetic**: `ADD`, `ADDC`, `SUBB`, `INC`, `DEC`, `MUL AB`, `DIV AB`, `DA A`.
  - **Logic & Rotates**: `ANL`, `ORL`, `XRL`, `CLR`, `SETB`, `CPL`, `RL`, `RLC`, `RR`, `RRC`, `SWAP`.
  - **Control Flow**: `NOP`, `SJMP`, `AJMP` (11-bit in-page), `LJMP` (16-bit), `JZ`, `JNZ`, `JC`, `JNC`, `JB`, `JNB`, `JBC`, `CJNE`, `DJNZ`, `ACALL`, `LCALL`, `RET`.

---

## 📁 Project Structure

```text
8051_simulator/
├── src/
│   ├── cpu.ts        # CPU8051 class, registers, memory models, step()
│   ├── opcodes.ts    # 256-element jump table & opcode handlers
│   ├── flags.ts      # Flag calculations (CY, AC, OV, Parity)
│   ├── types.ts      # SFR addresses, PSW bitmasks, StepResult
│   └── index.ts      # Public API exports
├── test/
│   └── cpu.test.ts   # Vitest unit test suite (36 tests)
├── dist/             # Compiled JS and TypeScript declaration maps (.d.ts)
├── package.json
└── tsconfig.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- `npm`

### Installation

```bash
npm install
```

### Build

Compile TypeScript source to `dist/`:

```bash
npm run build
```

### Run Tests

Run the Vitest test suite:

```bash
npm test
```

---

## 💻 Usage Example

```typescript
import { CPU8051, SFR, PSW_MASK } from './src/index.js';

const cpu = new CPU8051();

// Load machine code into ROM:
// 1. MOV A, #0x7F   (0x74 0x7F)
// 2. ADD A, #0x01   (0x24 0x01) -> Signed overflow (OV=1), AC=1, A=0x80, P=1
cpu.loadProgram([0x74, 0x7F, 0x24, 0x01]);

// Execute instruction 1: MOV A, #0x7F
const step1 = cpu.step();
console.log(`Executed step 1 in ${step1.cycles} cycle(s). ACC = 0x${cpu.acc.toString(16)}`);

// Execute instruction 2: ADD A, #0x01
const step2 = cpu.step();
console.log(`Executed step 2 in ${step2.cycles} cycle(s). ACC = 0x${cpu.acc.toString(16)}`);
console.log(`Overflow (OV): ${cpu.getFlag(PSW_MASK.OV)}`); // true
console.log(`Auxiliary Carry (AC): ${cpu.getFlag(PSW_MASK.AC)}`); // true
console.log(`Carry (CY): ${cpu.getFlag(PSW_MASK.CY)}`); // false
console.log(`Parity (P): ${cpu.getFlag(PSW_MASK.P)}`); // true (0x80 has 1 set bit)
```

---

## 🗺️ Roadmap & Next Steps

- [x] **Core Instruction Set & Timing**: 256-element jump table, arithmetic flags, parity bit, and register bank switching.
- [ ] **Peripheral Emulation**:
  - Timers 0 & 1 (Modes 0, 1, 2, 3 via `TMOD` and `TCON`).
  - Interrupt system (external INT0/INT1, timer interrupts, priority via `IE` and `IP`).
  - Serial interface / UART (`SCON`, `SBUF`, baud rate generator).
  - Parallel I/O ports (`P0`–`P3`).
- [ ] **Assembly & Tooling**:
  - 8051 two-pass assembler and Intel HEX parser.
  - Breakpoint controller and execution trace logger.
- [ ] **Visualization**:
  - Web UI for memory, register, and port inspection.
