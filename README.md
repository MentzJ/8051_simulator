# 8051 Microprocessor Simulator & Visual Web Debugger

A cycle-accurate Intel 8051 microcontroller CPU emulation core, integrated 2-pass assembler, hardware timer & interrupt engine, and interactive visual web debugger built with TypeScript, React 19, Vite, and Tailwind CSS.

---

## ⚡ Features at a Glance

- **🖥️ Interactive Visual Web Debugger**: Modern dark-mode IDE for writing, assembling, stepping, and observing 8051 execution in real time.
- **⚙️ Integrated Two-Pass Assembler**: In-browser Intel 8051 assembler with label resolution, directives (`ORG`, `DB`, `EQU`, `END`), multi-format numeric literals, bit dot-notation, and source mapping.
- **⏱️ Cycle-Accurate CPU Core**: Single-step execution model via `step(): { cycles: number }` dispatched across a complete 256-element jump table returning exact machine cycles (`1`, `2`, or `4`).
- **⏲️ Hardware Timers (Timer 0 & Timer 1)**:
  - **Mode 1 (16-bit Counter)**: Cascades `TLx` and `THx` with 16-bit overflow flag assertion (`TF0` / `TF1`).
  - **Mode 2 (8-bit Auto-Reload)**: Continuously increments `TLx` and auto-reloads from `THx` upon overflow.
  - Controlled via `TCON` (`0x88`) run bits (`TR0` / `TR1`) and `TMOD` (`0x89`) clock selector (`C/T = 0`).
  - Real-time peripheral cycle advancement via `tickPeripherals(cycles)`.
- **⚡ Two-Level Interrupt Engine**:
  - Global interrupt enable check via `IE.7` (`EA`).
  - Dedicated hardware vectors: **Timer 0** (`0x000B`) and **Timer 1** (`0x001B`).
  - 2-level priority arbitration via `IP` (`0xB8`): High-priority interrupts preempt low-priority routines.
  - Automatic stack vectoring (`SP += 2`, low byte then high byte pushed), request flag clearing (`TF0` / `TF1`), and in-service priority latching.
  - **`RETI` Opcode (`0x32`)**: Restores return address from stack and clears the active interrupt-in-service latch.
- **🧠 Complete Memory Architecture**:
  - **Internal RAM (256 bytes)**: Lower 128 bytes (Register Banks 0–3, bit-addressable RAM, scratchpad RAM) and upper 128 bytes (indirect access).
  - **Special Function Registers (128 bytes)**: SFR space mapped from `0x80` to `0xFF`.
  - **Program Memory / ROM (64 KB)**: 16-bit addressable code memory.
- **📊 Real-Time Register & Flag Dashboard**: ACC, B, PC, SP, DPTR (`DPH`/`DPL`), and PSW with multi-format views (Hex, Dec, Bin), dynamic value-change highlights, and individual PSW flag toggles (CY, AC, F0, RS1, RS0, OV, F1, P).
- **🗄️ Interactive 16×8 RAM Matrix**: 128-byte memory grid with region color-coding (Register Banks, Bit RAM, Scratchpad), active Stack Pointer indicator, memory write tracking, and inspection tooltips.
- **🎮 Flexible Execution Controls**: Single-step, continuous run, pause, reset, and configurable execution speeds (`1 Hz`, `10 Hz`, `Max` via `requestAnimationFrame`).
- **📚 Built-in Preset Programs**: Ready-to-run demo programs demonstrating loop counters, the Fibonacci sequence, register bank switching, arithmetic flags, and a Timer 0 Mode 2 square wave generator.

---

## ⏱️ Timers & Interrupt Controller Architecture

### Hardware Timers (TCON `0x88`, TMOD `0x89`)
The simulator features hardware-accurate Timer 0 and Timer 1 peripherals clocked on internal machine cycles:

- **TCON Register (`0x88`, Bit-Addressable)**:
  - `TF1` (bit 7): Timer 1 Overflow flag (set on rollover, cleared automatically by hardware vectoring).
  - `TR1` (bit 6): Timer 1 Run control bit (1 = running, 0 = stopped).
  - `TF0` (bit 5): Timer 0 Overflow flag (set on rollover, cleared automatically by hardware vectoring).
  - `TR0` (bit 4): Timer 0 Run control bit (1 = running, 0 = stopped).
  - `IE1`, `IT1`, `IE0`, `IT0` (bits 3–0): External interrupt edge flags and trigger type selectors.
- **TMOD Register (`0x89`)**:
  - Upper nibble controls Timer 1 (`GATE`, `C/T`, `M1`, `M0`); lower nibble controls Timer 0.
  - `C/T = 0`: Clocked internally by machine cycles (`tickPeripherals(cycles)`).
  - **Mode 1 (`M1=0, M0=1`)**: 16-bit counter mode. `TLx` increments each cycle, cascading into `THx`. Overflow at `0xFFFF` rolls to `0x0000` and asserts `TFx`.
  - **Mode 2 (`M1=1, M0=0`)**: 8-bit auto-reload mode. `TLx` increments each cycle. Rollover from `0xFF` to `0x00` automatically reloads `TLx` from `THx` and asserts `TFx`.
  - **Mode 0 (`M1=0, M0=0`)**: 13-bit counter mode (5-bit `TLx` + 8-bit `THx`).

### Interrupt Controller Engine (IE `0xA8`, IP `0xB8`)
Checked synchronously at the start of each `step()` call:

- **IE Register (`0xA8`, Bit-Addressable)**:
  - `EA` (bit 7): Global Interrupt Enable. If `EA == 0`, no interrupts are serviced.
  - `ET1` (bit 3): Timer 1 Interrupt Enable.
  - `ET0` (bit 1): Timer 0 Interrupt Enable.
- **IP Register (`0xB8`, Bit-Addressable)**:
  - `PT1` (bit 3): Timer 1 Priority level (1 = High, 0 = Low).
  - `PT0` (bit 1): Timer 0 Priority level (1 = High, 0 = Low).
- **Service & Vectoring Sequence**:
  1. If an interrupt is pending and enabled, and its priority level exceeds or equals the required threshold (high priority preempts low priority):
  2. The current Program Counter (`PC`) is pushed onto the stack: `SP += 2`, low byte at `SP-1`, high byte at `SP`.
  3. The corresponding request flag (`TF0` or `TF1` in `TCON`) is automatically cleared.
  4. The internal in-service priority latch is activated (`inServiceHigh` or `inServiceLow`).
  5. The CPU vectors to the handler address:
     - **Timer 0**: `0x000B`
     - **Timer 1**: `0x001B`
  6. The vectoring operation consumes **2 machine cycles** (hardware LCALL).
- **`RETI` (Opcode `0x32`)**:
  - Returns from Interrupt routine. Pops high byte, then low byte from the stack into `PC`.
  - Clears the active interrupt-in-service latch, re-enabling interrupts at that priority level.

---

## 🖥️ Visual Web Debugger

The web interface provides an interactive, full-featured simulation environment:

### 1. Code Editor & Assembler View
- **ROM PC Gutter**: Gutter displays both source line numbers and resolved 16-bit ROM Program Counter (PC) offsets.
- **Active Instruction Tracking**: Real-time line highlight indicating the instruction currently being executed by the CPU.
- **Inline Error Diagnostics**: Highlights lines with syntax or assembly errors and displays actionable diagnostic tooltips.
- **Editor Ergonomics**: Tab indentation handling, live byte count, and line count statistics.

### 2. Register Dashboard
- **Primary Registers**: Real-time display of Accumulator (`ACC` / `0xE0`), `B` (`0xF0`), Program Counter (`PC`), Stack Pointer (`SP`), Data Pointer (`DPTR` with `DPH`/`DPL`), and Program Status Word (`PSW`).
- **Multi-Format Representation**: Inspect register contents simultaneously in Hexadecimal (`0x..`), Decimal, and Binary (`0b........`).
- **Dynamic Change Highlighting**: Highlights registers that were modified during the most recent execution step.
- **PSW Status Flags**: Dedicated status badges for **CY** (Carry), **AC** (Auxiliary Carry), **F0**, **RS1** / **RS0** (Register Bank Select), **OV** (Overflow), **F1**, and **P** (Parity).
- **Register Banks**: Monitor the active bank (Banks 0–3) and view registers `R0`–`R7` mapped to RAM offsets `0x00`, `0x08`, `0x10`, or `0x18`.

### 3. Internal RAM Hex Matrix
- **128-Byte Lower RAM Grid**: 16×8 matrix presenting internal RAM bytes (`0x00`–`0x7F`).
- **Region Identification**: Color-coded memory segments:
  - `0x00`–`0x1F`: Register Banks 0, 1, 2, and 3 (`R0`–`R7`)
  - `0x20`–`0x2F`: Bit-Addressable RAM (Bits `0x00`–`0x7F`)
  - `0x30`–`0x7F`: General-Purpose Scratchpad RAM
- **Stack Pointer (SP) Indicator**: Visual marker highlighting the current top of the hardware stack.
- **Write Tracking**: Memory cells modified during program execution are highlighted in real time.
- **Byte Inspector Tooltip**: Hover over any byte to inspect its hex value, decimal value, ASCII representation, and memory region description.

### 4. Execution Controls & Metrics
- **Step**: Executes a single machine instruction (or services an interrupt) and updates all visual components and metrics.
- **Run / Pause**: Continuous program execution with animated state updates.
- **Speed Selector**:
  - `1 Hz`: Slow-motion execution (1 instruction/second) for step-by-step observation.
  - `10 Hz`: Interactive execution (10 instructions/second) for animated loops.
  - `Max`: Unthrottled browser execution loop via `requestAnimationFrame`.
- **Reset**: Re-initializes CPU registers, clears internal RAM and latches, resets cycle and instruction counters, and rewinds the PC to `0x0000`.
- **Execution Badges**: Live counters for total elapsed clock cycles, instructions executed, and CPU state (`IDLE`, `RUNNING`, `HALTED`).

---

## ⚙️ Built-In Two-Pass Assembler

The built-in assembler (`Assembler8051`) converts standard Intel 8051 assembly code into executable machine code (`Uint8Array`):

### Two-Pass Architecture
1. **Pass 1: Comment Stripping & Symbol Table Generation**:
   - Removes comments prefixed by `;`.
   - Identifies label definitions (`LABEL:` or `LABEL: INSTR`).
   - Tracks instruction byte lengths to assign accurate 16-bit ROM addresses to all labels.
   - Evaluates directives (`ORG`, `EQU`, `DB`, `END`).
2. **Pass 2: Binary Code Emission & Source Mapping**:
   - Encodes opcodes and operands into machine code bytes.
   - Computes 8-bit signed relative branch displacements (-128 to +127 bytes) for `SJMP`, `CJNE`, `DJNZ`, `JC`, `JNC`, `JZ`, `JNZ`, `JB`, `JNB`, and `JBC`.
   - Resolves 11-bit in-page absolute addresses for `AJMP` and `ACALL`.
   - Resolves 16-bit long jump and call addresses for `LJMP` and `LCALL`.
   - Produces a `sourceMap` array (`{ line, pc, source }`) to synchronize the editor with the CPU Program Counter.

### Syntax & Supported Formats
- **Numeric Literals**:
  - Hexadecimal: `20H`, `0FFH`, `0x20`, `#20H`
  - Decimal: `32`, `255`, `10D`
  - Binary: `00100000B`, `101b`
  - ASCII Characters: `'A'`, `"Z"`
  - Current Location Counter: `$` (e.g., `SJMP $` for self-loop)
- **Bit-Addressing Dot Notation & Standard Bit Names**:
  - SFR bits: `PSW.7`, `P1.0`, `ACC.0`, etc.
  - TCON bits: `TF1`, `TR1`, `TF0`, `TR0`, `IE1`, `IT1`, `IE0`, `IT0`.
  - IE bits: `EA`, `ET1`, `EX1`, `ET0`, `EX0`, `ES`.
  - IP bits: `PT1`, `PX1`, `PT0`, `PX0`, `PS`.
  - RAM bits: `20H.0` (bit `0x00`), `20H.7` (bit `0x07`), `21H.0` (bit `0x08`), etc.
- **Standard Directives**:
  - `ORG <address>`: Sets the Program Counter assembly origin.
  - `EQU <value>`: Defines symbolic constants.
  - `DB <byte1>, <byte2>, ...`: Emits raw byte data into ROM.
  - `END`: Terminates assembly.

---

## 🧩 Comprehensive Instruction Set Support

- **Data Transfer**:
  - `MOV` (immediate, direct, register `Rn`, indirect `@Ri`, 16-bit `DPTR`, bit-to-carry)
  - `PUSH`, `POP`
  - `XCH`, `XCHD`
- **Arithmetic**:
  - `ADD`, `ADDC`, `SUBB`, `INC`, `DEC`
  - `MUL AB` (multiplies A and B, updates OV on overflow > 255, 4 cycles)
  - `DIV AB` (divides A by B, sets OV on division by zero, 4 cycles)
  - `DA A` (Decimal Adjust Accumulator for BCD addition)
- **Logic & Rotates**:
  - `ANL`, `ORL`, `XRL`
  - `CLR`, `SETB`, `CPL`
  - `RL`, `RLC`, `RR`, `RRC`, `SWAP`
- **Control Flow**:
  - `NOP`
  - `SJMP` (short relative jump)
  - `AJMP`, `ACALL` (11-bit in-page absolute jump / call)
  - `LJMP`, `LCALL` (16-bit long jump / call)
  - `JZ`, `JNZ`, `JC`, `JNC`, `JB`, `JNB`, `JBC`
  - `CJNE` (compare and jump if not equal)
  - `DJNZ` (decrement and jump if not zero)
  - `RET` (return from subroutine)
  - `RETI` (return from interrupt, pops PC and clears interrupt latch, opcode `0x32`)

---

## 📁 Project Structure

```text
8051_simulator/
├── src/
│   ├── components/
│   │   ├── CodeEditor.tsx        # Assembly code editor with PC gutter & line tracking
│   │   ├── Controls.tsx          # Execution stepper, run/pause, reset, and speed controls
│   │   ├── Header.tsx            # Navigation bar, demo preset selector, and runtime stats
│   │   ├── RamGrid.tsx           # Interactive 16×8 lower RAM matrix with tooltips
│   │   └── RegisterDashboard.tsx # Live register, flag, and bank inspector
│   ├── assembler.ts              # 2-Pass 8051 Assembler, literal parser & symbol resolver
│   ├── cpu.ts                    # CPU8051 core, timers, interrupt engine & cycle clocking
│   ├── flags.ts                  # Flag calculations (CY, AC, OV, Parity)
│   ├── index.css                 # Tailwind CSS styles & typography configuration
│   ├── index.ts                  # Public library exports
│   ├── main.tsx                  # React application entry point
│   ├── opcodes.ts                # 256-element opcode jump table (including RETI 0x32)
│   ├── presets.ts                # Built-in demo assembly programs
│   ├── types.ts                  # SFR addresses, bitmasks (PSW, TCON, TMOD, IE, IP)
│   └── App.tsx                   # Main dashboard layout & simulation state orchestrator
├── test/
│   ├── assembler.test.ts         # Vitest unit tests for 2-pass assembler (9 tests)
│   ├── cpu.test.ts               # Vitest unit tests for CPU8051 core instructions (36 tests)
│   └── timer_interrupt.test.ts   # Vitest unit tests for timers & interrupt engine (13 tests)
├── index.html                    # Web app HTML template with JetBrains Mono font
├── package.json                  # Scripts & project dependencies
├── postcss.config.js             # PostCSS configuration for Tailwind
├── tailwind.config.js            # Tailwind CSS design system configuration
├── tsconfig.json                 # TypeScript compiler configuration
└── vite.config.ts                # Vite dev server and build configuration
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

### Development Server

Start the interactive visual debugger web application locally:

```bash
npm run dev
```

Then open your browser at `http://localhost:5173`.

### Production Build

Compile and bundle the web application for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

### Run Tests

Run the complete Vitest test suite (58 unit tests):

```bash
npm test
```

---

## 💻 Programmatic Usage Examples

### 1. Timer 0 Square Wave Generator with Interrupts

```typescript
import { assemble, CPU8051 } from './src/index.js';

const source = `
  ORG 0000H
      LJMP MAIN

  ORG 000BH
      ; Timer 0 Interrupt Service Routine (ISR)
      CPL ACC.0           ; Toggle square wave output (ACC.0)
      RETI                ; Return from interrupt (clears latch & pops PC)

  MAIN:
      MOV A, #00H         ; Clear Accumulator (Square wave starts low)
      MOV TMOD, #02H      ; Timer 0 in Mode 2 (8-bit auto-reload, C/T=0)
      MOV TH0, #0CEH      ; Auto-reload value = 256 - 50 = 206 (0xCE)
      MOV TL0, #0CEH      ; Initial counter value
      MOV IE, #82H        ; Enable Global Interrupts (EA=1) & Timer 0 (ET0=1)
      SETB TR0            ; Start Timer 0

  LOOP:
      SJMP LOOP           ; Main loop idling, awaiting timer interrupts
`;

const { code, errors } = assemble(source);
if (errors.length === 0) {
  const cpu = new CPU8051();
  cpu.loadProgram(code);

  // Run simulation for 200 cycles
  let cyclesElapsed = 0;
  while (cyclesElapsed < 200) {
    const res = cpu.step();
    cyclesElapsed += res.cycles;
  }

  // ACC.0 has toggled on every 50-cycle auto-reload interrupt!
  console.log(`Current ACC.0: ${cpu.acc & 1}`);
}
```

### 2. Programmatic Assembly & Loop Execution

```typescript
import { assemble, CPU8051, PSW_MASK } from './src/index.js';

const source = `
  ORG 0000H
  MOV R0, #05H        ; Loop counter = 5
  MOV A, #00H         ; Clear Accumulator

LOOP:
  INC A               ; A = A + 1
  DJNZ R0, LOOP       ; Loop until R0 == 0

DONE:
  MOV 30H, A          ; Store result (5) in RAM 0x30
  SETB PSW.7          ; Set Carry Flag (CY)
  SJMP DONE           ; Halt
`;

const { code, errors } = assemble(source);

if (errors.length === 0) {
  const cpu = new CPU8051();
  cpu.loadProgram(code);

  while (cpu.pc < 10) {
    const result = cpu.step();
    console.log(`Executed PC: 0x${cpu.pc.toString(16)} (${result.cycles} cycles)`);
  }

  console.log(`Accumulator: ${cpu.acc}`);                 // 5
  console.log(`RAM[0x30]: ${cpu.ram[0x30]}`);             // 5
  console.log(`Carry flag: ${cpu.getFlag(PSW_MASK.CY)}`); // true
}
```

### 3. Headless CPU Core Manual Machine Code Loading

```typescript
import { CPU8051, PSW_MASK } from './src/index.js';

const cpu = new CPU8051();

// Load raw opcodes directly into ROM:
// 1. MOV A, #0x7F   (0x74 0x7F)
// 2. ADD A, #0x01   (0x24 0x01) -> Signed overflow (OV=1), AC=1, A=0x80, P=1
cpu.loadProgram([0x74, 0x7F, 0x24, 0x01]);

// Step instruction 1: MOV A, #0x7F
const step1 = cpu.step();
console.log(`Step 1 cycles: ${step1.cycles}, ACC = 0x${cpu.acc.toString(16)}`);

// Step instruction 2: ADD A, #0x01
const step2 = cpu.step();
console.log(`Step 2 cycles: ${step2.cycles}, ACC = 0x${cpu.acc.toString(16)}`);
console.log(`OV: ${cpu.getFlag(PSW_MASK.OV)}`); // true
console.log(`AC: ${cpu.getFlag(PSW_MASK.AC)}`); // true
console.log(`CY: ${cpu.getFlag(PSW_MASK.CY)}`); // false
console.log(`P:  ${cpu.getFlag(PSW_MASK.P)}`);  // true
```

---

## 🗺️ Roadmap & Next Steps

- [x] **Core Instruction Set & Timing (Phase 1)**:
  - 256-element opcode jump table with cycle timing.
  - Complete arithmetic flags (CY, AC, OV) and dynamic parity bit calculation.
  - Register Bank switching (Banks 0–3 via PSW `RS0`/`RS1`).
  - Bit-addressable memory space (RAM `0x20`–`0x2F` and SFRs).
- [x] **Assembly & Tooling (Phase 2)**:
  - Built-in two-pass 8051 assembler (`Assembler8051`).
  - Intel 8051 syntax parser with multi-format literal numbers and dot bit addressing.
  - Directives: `ORG`, `DB`, `EQU`, `END`.
  - Source mapping linking source line numbers to 16-bit ROM offsets.
- [x] **Visualization & Web IDE (Phase 2)**:
  - Dark-theme web dashboard (React 19 + Tailwind CSS + Lucide Icons).
  - Synchronized assembly code editor with PC gutter and active instruction highlighting.
  - Real-time Register & Status dashboard (ACC, B, DPTR, SP, PC, PSW flags, active bank).
  - 16×8 lower RAM matrix with memory region tagging, SP marker, and write tracking.
  - Execution controls with configurable speeds (`1 Hz`, `10 Hz`, `Max`).
  - Built-in demo presets (Increment Loop, Fibonacci Generator, Register Bank Switch, Arithmetic Flags, Timer 0 Square Wave).
- [x] **Timers & Interrupt Controller (Phase 3 - Core)**:
  - Timers 0 & 1 in Mode 1 (16-bit counter) and Mode 2 (8-bit auto-reload from THx to TLx).
  - TCON (`0x88`) and TMOD (`0x89`) register modeling with internal clock mode (`C/T=0`).
  - Interrupt engine with `EA` global gate, vectors (`Timer 0 -> 0x000B`, `Timer 1 -> 0x001B`).
  - 2-level priority arbitration via `IP` register.
  - Return from interrupt (`RETI`, opcode `0x32`) restoring PC and clearing in-service latches.
  - Cycle-accurate peripheral clock stepper via `tickPeripherals(cycles)`.
- [ ] **Serial & I/O Ports (Phase 3 - Expansion)**:
  - External interrupts (`INT0` / `INT1`).
  - Serial interface / UART (`SCON`, `SBUF`, baud rate generator).
  - Parallel I/O ports (`P0`–`P3`).
- [ ] **Advanced Tooling (Phase 4)**:
  - Intel HEX file parser and file drag-and-drop import.
  - Breakpoint controller and execution trace logger / waveform panel.
