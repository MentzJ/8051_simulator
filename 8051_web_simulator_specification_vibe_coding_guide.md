# Web-Based 8051 Simulator: Specification & Vibe Coding Blueprint

This document contains the complete specification, architectural plan, and phase-by-phase vibe coding instructions for building a browser-based Intel 8051 microcontroller simulator.

---

## 1. System Architecture Overview

Building a web-based 8051 simulator requires striking a balance between **architectural fidelity** (how accurately you emulate the legacy Harvard architecture and timing) and **usability** (browser performance, responsive debugging, and intuitive visualization).

A modern web-based simulator is best divided into three decoupled layers:

```
┌────────────────────────────────────────────────────────┐
│                   Web UI (Frontend)                    │
│  Monaco Editor | Memory Grid | Peripherals | Controls  │
└───────────────────────────┬────────────────────────────┘
                            │ Web Worker Message API
┌───────────────────────────▼────────────────────────────┐
│                    Simulation Engine                   │
│   Decoder/ALU   │ Timers/Interrupts │ Cycle Scheduler │
├───────────────────────────┼────────────────────────────┤
│                    Memory Subsystem                    │
│   Registers/SFRs │ Internal RAM │ External ROM/RAM     │
└────────────────────────────────────────────────────────┘
```

* **Web Worker Execution:** Run the CPU emulation loop inside a dedicated `WebWorker` so that continuous execution at pseudo-clock speed (e.g., 12 MHz equivalent) or tight infinite loops never freeze the browser UI thread.
* **Shared Memory / State Snapshots:** Use either `SharedArrayBuffer` for zero-copy state sharing or post state diffs (registers, changed memory addresses, pin states) to the UI thread at a throttled rate (e.g., 30–60 FPS).

---

## 2. Emulation Engine & Core Specifications

### CPU Core & Pipeline
* **Instruction Set:** Complete standard Intel MCS-51 instruction set (255 valid opcodes, 1 unassigned `0xA5`).
* **Addressing Modes:** Direct, indirect (`@R0`, `@R1`, `@DPTR`), register-specific (`Rn`), immediate (`#data`), and relative/absolute/long jumps.
* **Cycle-Accurate Timing:** 
  * Track machine cycles (1 machine cycle = 12 oscillator periods on the classic 8051).
  * Instructions consume 1, 2, or 4 machine cycles. A cycle counter must advance deterministically for timer and baud rate accuracy.

### Memory Layout
The 8051 uses a split Harvard architecture with distinct address spaces:

| Space | Size | Address Range | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Internal RAM** | 128 bytes (classic) / 256 bytes (8052) | `0x00`–`0x7F` (lower) / `0x80`–`0xFF` (upper via indirect) | Four register banks (0–3), bit-addressable RAM (`0x20`–`0x2F`), stack. |
| **SFR (Special Function Registers)** | 128 bytes | `0x80`–`0xFF` (direct addressing only) | `ACC`, `B`, `PSW`, `SP`, `DPTR` (`DPL`/`DPH`), `P0`–`P3`, `IP`, `IE`, `TMOD`, `TCON`, `SCON`, `PCON`. |
| **External Data Memory (XRAM)** | Up to 64 KB | `0x0000`–`0xFFFF` | Accessed via `MOVX @DPTR` or `MOVX @Ri`. Sparse allocation (allocate pages on demand). |
| **Program Memory (ROM)** | Up to 64 KB | `0x0000`–`0xFFFF` | Byte array containing assembled machine code. Accessed via `MOVC`. |

---

## 3. Peripheral Subsystems

### Interrupt Controller
* **Interrupt Sources (Priority High/Low via `IP`):**
  1. External Interrupt 0 (`/INT0`)
  2. Timer 0 Overflow (`TF0`)
  3. External Interrupt 1 (`/INT1`)
  4. Timer 1 Overflow (`TF1`)
  5. Serial Port (`RI` / `TI`)
* **Behavior:** Check pending interrupts at the end of every machine cycle, save `PC` to stack, and vector to ISR addresses (`0x0003`, `0x000B`, `0x0013`, `0x001B`, `0x0023`).

### Timers / Counters (Timer 0 & Timer 1)
* **Modes (0 to 3):**
  * Mode 0: 13-bit timer
  * Mode 1: 16-bit timer
  * Mode 2: 8-bit auto-reload (`THx` loads into `TLx`)
  * Mode 3: Split timer (Timer 0 split into two 8-bit counters)
* **Gating & Counters:** Support internal clock incrementing ($f_{osc}/12$) and external pin pulses (`T0` / `P3.4`, `T1` / `P3.5`).

### I/O Ports & Bit-Addressable Memory
* **Ports P0–P3:** Emulate quasi-bidirectional I/O latches. Writing `1` enables weak internal pull-up and input reading.
* **Bit Engine:** Support bit-level instructions (`SETB`, `CLR`, `CPL`, `JB`, `JNB`, `JBC`, `MOV C, bit`) for both RAM addresses `0x20`–`0x2F` (bits `0x00`–`0x7F`) and bit-addressable SFRs (`0x80`, `0x88`, `0x90`, etc.).

### UART Serial Interface
* Modes 0–3 with baud generation via Timer 1 overflow or internal clock.
* Provide a virtual serial terminal widget (ANSI terminal emulation like `xterm.js`) attached to `SBUF`.

---

## 4. Toolchain & In-Browser Assembler

To be usable without external tools, integrate an in-browser assembler:

* **Supported Input:** Standard Intel 8051 Assembly syntax and Intel HEX file import.
* **Lexer & Parser:**
  * Two-pass assembler written in TypeScript/Rust (compiled to WASM).
  * Directives: `ORG`, `EQU`, `DB`, `DW`, `END`, `BIT`, `DATA`.
  * Label resolution, math expressions in operands (e.g., `HIGH(label)`, `LOW(label)`), and syntax error diagnostics.
* **Source Mapping:** Build a line-to-PC mapping table so clicking a breakpoint in the source file links directly to the corresponding ROM address.

---

## 5. UI / UX Design & Debugging Features

A debugger-first layout (similar to VS Code or EDA tools like EdSim51):

1. **Code & Disassembly View:**
   * Monaco editor with syntax highlighting, gutter breakpoints, and current execution highlight (`PC`).
   * Disassembly viewer showing `Address | Hex Bytes | Mnemonic | Cycles`.
2. **Registers & Flag Panel:**
   * Primary: `A`, `B`, `DPTR`, `PC`, `SP`.
   * `PSW` visual bit flags: `CY`, `AC`, `F0`, `RS1`, `RS0`, `OV`, `-`, `P`.
   * Active register bank indicator (`R0`–`R7`).
3. **Memory Inspectors:**
   * Tabbed hex viewers for Internal RAM, SFR space, and External RAM.
   * Highlight cells modified during the last step in yellow/red.
   * Allow direct inline editing of memory cells.
4. **Execution Controls:**
   * `Run`, `Pause`, `Step Over`, `Step Into`, `Reset`.
   * Execution speed slider (Single step, 10 Hz, 1 kHz, Max/Real-time).
   * Total elapsed machine cycles and simulated runtime ($\mu s$/$ms$).
5. **Interactive Virtual Hardware Components:**
   * 8-pin DIP switches or pushbuttons wired to `P1` / `P3`.
   * 8-LED bar graph on `P1` / `P2`.
   * 7-segment displays (multiplexed or direct).
   * 16x2 character LCD (HD44780 emulation via port pins).

---

## 6. Recommended Technology Stack

| Component | Recommendation | Rationale |
| :--- | :--- | :--- |
| **Core Emulator** | **Rust (compiled to WebAssembly)** or **TypeScript** | Rust/WASM gives near-native execution speed, zero garbage collection pauses, and portable core logic. Modern TypeScript is also viable if optimizing memory via typed arrays (`Uint8Array`). |
| **Frontend Framework**| **React** or **Svelte** | Svelte provides lightweight reactivity for high-frequency state updates; React has rich ecosystem components (Monaco, GoldenLayout). |
| **Code Editor** | **Monaco Editor** | Native breakpoint gutter support, line decoration, and VS Code-grade editing experience. |
| **Terminal** | **xterm.js** | Industry standard for VT100/ANSI terminal emulation for UART I/O. |
| **Layout Manager** | **Dockview** or **GoldenLayout** | Allows users to dock/undock memory panels, I/O boards, and editor tabs. |

---

## 7. Phased Implementation Roadmap

* **Phase 1 (Core CPU & RAM):** Implement instruction decoder, ALU operations, basic SFRs (`A`, `B`, `PSW`, `SP`, `DPTR`), and lower 128 bytes of RAM. Verify with an automated test suite comparing register states against known 8051 test vectors.
* **Phase 2 (Assembler & Basic UI):** Build a 2-pass assembler and attach a simple Monaco editor with Step/Run controls and a register inspection table.
* **Phase 3 (Timers & Interrupts):** Implement cycle counting, Timer 0/1 in Modes 1 and 2, external interrupts, and interrupt priority resolution.
* **Phase 4 (I/O & Peripherals):** Quasi-bidirectional port emulation, UART with virtual terminal, and virtual LEDs/switches.
* **Phase 5 (XRAM & Optimization):** Add 64 KB external RAM/ROM support and move emulation into a Web Worker with throttled UI state rendering.

---

## 8. Vibe Coding Prompts by Phase

To vibe code this project using AI-assisted coding tools (Cursor, Claude Code, Copilot), use prompt chaining with rigid architectural constraints.

### Phase 1: Core CPU, ALU, & State Vector
**Focus:** Headless TypeScript, pure functions, `Uint8Array` memory maps, zero UI/DOM dependencies.

```text
Role: Systems Emulator Engineer.
Task: Create a headless TypeScript 8051 CPU core that executes one instruction step at a time.

Constraints & Architecture:
- Do NOT build any UI or DOM code. Pure TypeScript only.
- State: Model internal RAM (256 bytes) and SFRs (128 bytes) using typed arrays:
    - `ram: Uint8Array(256)`
    - `pc: number` (16-bit)
    - `sp: number` (8-bit, starts at 0x07)
    - Dedicated getter/setter for SFR addresses (ACC at 0xE0, B at 0xF0, PSW at 0xD0, DPL at 0x82, DPH at 0x83).
- Flag calculation: Implement accurate PSW flags for ADD/SUBB:
    - CY (Carry), AC (Auxiliary carry for BCD), OV (Signed overflow), P (Odd parity of ACC).
- Opcode execution:
    - Implement a `step(): { cycles: number }` method using a 256-element jump table or switch-case.
    - Implement the base opcode groups first: NOP (0x00), MOV (immediate, direct, Rn, @Ri), ADD, SUBB, INC, DEC, SJMP, AJMP, LJMP, and JZ/JNZ.
- Write a Vitest/Jest suite covering:
    - ACC parity updates after every math op.
    - Signed overflow (OV) on 0x7F + 0x01.
    - Carry (CY) and Auxiliary Carry (AC) on 0x0F + 0x01.
    - Register bank switching via PSW bits RS0/RS1.
```

---

### Phase 2: In-Browser Assembler & Minimal Debug UI
**Focus:** Visual verification, code editor, live hex dump grid, step debugger.

```text
Role: Frontend Developer specializing in developer tools.
Task: Create a minimal web debugger UI in React/Svelte and a 2-pass 8051 assembler.

Components:
1. Assembler (`assembler.ts`):
   - Accept multi-line assembly text with standard Intel syntax (e.g., "MOV A, #20H", labels "LOOP:", "SJMP LOOP").
   - Pass 1: Strip comments (';'), parse labels into a symbol table mapping names to 16-bit ROM offsets.
   - Pass 2: Emit `Uint8Array` of machine code and a source-map array `{ line: number, pc: number }`.
2. UI Layout (Tailwind CSS, dark mode):
   - Left: Code editor (Monaco or a clean `<textarea>` with line numbers) pre-loaded with an increment/loop demo.
   - Middle: "Step", "Run", "Pause", "Reset" control bar + execution speed selector (1 Hz, 10 Hz, Max).
   - Right: Register dashboard displaying A, B, PC, SP, DPTR, and individual badges for PSW flags (CY, AC, OV, P).
   - Bottom: 16x8 hex grid showing internal RAM (0x00–0x7F), with modified cells highlighted with a brief fade animation.
3. Behavior:
   - Clicking "Step" advances the CPU by 1 instruction, highlights the active line in the code editor, and updates the register dashboard.
```

---

### Phase 3: Timers, Interrupts, & Cycle Scheduling
**Focus:** Cycle accuracy, timer overflow logic, nested interrupt handling.

```text
Role: Embedded Systems Simulator Architect.
Task: Implement Timer 0, Timer 1, and the Interrupt Controller into our 8051 TypeScript core.

Requirements:
1. Cycle Clocking:
   - Update `step()` to return the exact machine cycles consumed (1, 2, or 4 cycles).
   - Pass elapsed cycles to a `tickPeripherals(cycles: number)` function.
2. Timers (TCON 0x88, TMOD 0x89):
   - Implement Timer 0 and Timer 1 in Mode 1 (16-bit counter) and Mode 2 (8-bit auto-reload from THx to TLx).
   - Increment timer registers on internal clock mode (C/T = 0) whenever TR0/TR1 is set in TCON.
   - Set TF0 / TF1 overflow flags in TCON when the counter rolls over.
3. Interrupt Engine:
   - Registers: IE (0xA8) and IP (0xB8).
   - Check pending interrupts at the start of `step()`:
     - Global enable check: `IE.7 (EA) == 1`.
     - Vectors: Timer 0 -> 0x000B, Timer 1 -> 0x001B.
     - When serviced: push current PC to stack (SP += 2), clear the request flag, set internal interrupt-in-service latch, jump to vector.
   - Implement the `RETI` opcode (0x32): pops PC and clears interrupt latch.
4. Validation test:
   - Write a unit test simulating a square wave generator: Timer 0 in Mode 2 generating an interrupt every 50 cycles to toggle ACC.0.
```

---

### Phase 4: Virtual I/O & Interactive Peripherals
**Focus:** Hardware interaction, quasi-bidirectional pin logic, serial console.

```text
Role: UI/UX & Hardware Simulation Specialist.
Task: Build interactive virtual peripherals wired to 8051 ports P1, P2, and UART.

Deliverables:
1. I/O Port Emulation:
   - Implement quasi-bidirectional logic for Port 1 (SFR 0x90) and Port 2 (SFR 0xA0).
   - External inputs (switches) can only pull pins LOW (0). If the CPU latch is 1, external pin dictates state.
2. Visual Peripherals Panel:
   - 8-LED Bar Graph: Wired to P1. Render 8 round LEDs (green when pin bit is 0, off/dark when 1, reflecting active-low convention).
   - 8-DIP Switch: Wired to P2. User clicks toggle bits between 0 and 1. Live-inject state into the CPU port read cycle.
   - 7-Segment Display: A single 7-segment + decimal point digit connected to P1 with standard common-anode decoding.
3. Virtual UART Terminal:
   - Hook into `SBUF` (0x99) and `SCON` (0x98).
   - When CPU writes to `SBUF`, set `TI` flag in `SCON` after calculated baud duration and stream the ASCII character to an embedded virtual terminal (use xterm.js or a pre-styled monospaced log panel).
   - Allow user keyboard typing into the terminal to feed `RI` and fill `SBUF`.
```

---

### Phase 5: Web Worker Offloading & XRAM
**Focus:** Main-thread decoupling, batch cycle execution, 64KB external memory space.

```text
Role: Web Performance & WebAssembly/Worker Engineer.
Task: Decouple the 8051 simulation engine into a dedicated Web Worker and add 64KB External RAM (XRAM).

Architecture:
1. Web Worker Pipeline (`cpu.worker.ts`):
   - Move the CPU core and all memory arrays into the Worker.
   - Run a batch execution loop: instead of messaging per cycle, run N cycles (e.g., 50,000 cycles) per batch or use `requestAnimationFrame` post-message hooks to throttle UI updates to 60 FPS.
   - Send lightweight state diffs to the main thread: `{ pc, sp, psw, acc, b, dptr, p1, p2, cyclesElapsed, dirtyRamAddresses }`.
2. Main Thread Synchronization:
   - Keep UI responsive while the emulator runs at an equivalent 12 MHz clock rate.
   - Worker controls: post `{ type: 'RUN' }`, `{ type: 'PAUSE' }`, `{ type: 'STEP' }`, `{ type: 'SET_PIN', port, pin, value }`.
3. XRAM Implementation:
   - Implement 64KB external memory space accessed via `MOVX @DPTR, A` and `MOVX A, @DPTR`.
   - Add a tab in the memory inspector for "External RAM" with an address jump input (e.g., jump to 0x2000) and lazy-rendered virtual scroll.
```

---

## 9. Golden Rules for Vibe Coding an Emulator

1. **Verify with opcodes, not assumptions:** Reference the official *Intel MCS-51 Microcontroller Family User's Manual* for flag changes and machine cycle durations.
2. **Never bundle Assembler + CPU in one prompt:** Keep the parser and execution loop strictly decoupled. Verify the CPU using raw byte arrays (`[0x74, 0x55]` for `MOV A, #55H`) before writing the assembler.
3. **Log cycle counts early:** Tracking cycle elapsed times from Day 1 ensures that timers, UART baud generation, and delay routines work properly without painful refactoring later.