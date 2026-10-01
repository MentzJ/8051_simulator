export interface DemoPreset {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'increment-loop',
    name: 'Increment & Loop (Default)',
    description: 'Demonstrates loop counters with DJNZ, accumulator increments, RAM writes, and flag setting.',
    code: `; ==========================================
; 8051 Increment & Loop Demo
; Computes iterative sum, writes results to
; internal RAM, and manipulates status flags.
; ==========================================
ORG 0000H
    MOV R0, #05H        ; Loop counter = 5
    MOV A, #00H         ; Clear Accumulator
    MOV 30H, #00H       ; Initialize RAM 30H to 0

LOOP:
    INC A               ; A = A + 1
    ADD A, #02H         ; Add 2 (total increment +3)
    MOV 30H, A          ; Store intermediate sum to RAM 30H
    DJNZ R0, LOOP       ; Decrement R0; loop if R0 != 0

DONE:
    MOV 31H, A          ; Store final sum in RAM 31H (expected 15 = 0x0F)
    SETB 20H.0          ; Set bit 0 of bit-addressable RAM 20H
    SETB PSW.7          ; Set Carry Flag (CY)
    SJMP DONE           ; Halt loop
`,
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci Sequence',
    description: 'Generates the first 8 Fibonacci numbers and stores them in RAM starting at 0x40.',
    code: `; ==========================================
; Fibonacci Series Generator
; Generates: 0, 1, 1, 2, 3, 5, 8, 13
; Stored sequentially into RAM 40H..47H
; ==========================================
ORG 0000H
    MOV R0, #40H        ; Pointer to RAM output buffer
    MOV R1, #06H        ; Counter for next 6 terms
    MOV 40H, #00H       ; Fib(0) = 0
    MOV 41H, #01H       ; Fib(1) = 1
    INC R0
    INC R0              ; R0 now points to 42H

FIB_LOOP:
    DEC R0              ; Point to Fib(n-1)
    MOV A, @R0          ; Read Fib(n-1)
    DEC R0              ; Point to Fib(n-2)
    ADD A, @R0          ; A = Fib(n-1) + Fib(n-2)
    INC R0
    INC R0              ; Point back to current Fib(n) destination
    MOV @R0, A          ; Store Fib(n)
    INC R0              ; Advance pointer
    DJNZ R1, FIB_LOOP   ; Repeat for remaining terms

HALT:
    SJMP HALT           ; Complete
`,
  },
  {
    id: 'bank-switching',
    name: 'Register Bank Switch',
    description: 'Switches between Register Banks 0, 1, 2, and 3 using PSW RS0/RS1 and writes distinctive signatures.',
    code: `; ==========================================
; Register Bank Switching Demo
; Demonstrates RS0 (PSW.3) and RS1 (PSW.4)
; routing R0..R7 across RAM 0x00, 0x08, 0x10, 0x18
; ==========================================
ORG 0000H
    ; Bank 0 (RAM 0x00 - 0x07)
    MOV PSW, #00H       ; Select Bank 0
    MOV R0, #0AAH       ; Write 0xAA to RAM 0x00
    MOV R1, #011H

    ; Bank 1 (RAM 0x08 - 0x0F)
    SETB PSW.3          ; Set RS0 -> Bank 1
    MOV R0, #0BBH       ; Write 0xBB to RAM 0x08
    MOV R1, #022H

    ; Bank 2 (RAM 0x10 - 0x17)
    CLR PSW.3           ; Clear RS0
    SETB PSW.4          ; Set RS1 -> Bank 2
    MOV R0, #0CCH       ; Write 0xCC to RAM 0x10
    MOV R1, #033H

    ; Bank 3 (RAM 0x18 - 0x1F)
    SETB PSW.3          ; Set RS0 and RS1 -> Bank 3
    MOV R0, #0DDH       ; Write 0xDD to RAM 0x18
    MOV R1, #044H

    ; Return to Bank 0
    MOV PSW, #00H
DONE:
    SJMP DONE
`,
  },
  {
    id: 'math-flags',
    name: 'Arithmetic Overflow & Flags',
    description: 'Triggers Carry (CY), Auxiliary Carry (AC), Overflow (OV), and Parity (P) flags using ADD and SUBB.',
    code: `; ==========================================
; Arithmetic & Flags Demonstration
; Inspect CY, AC, OV, and P badges as math executes
; ==========================================
ORG 0000H
    ; 1. Signed Overflow (OV) and Parity (P)
    MOV A, #7FH         ; A = +127 (01111111b)
    ADD A, #01H         ; A = +128 / -128 (10000000b) -> OV=1, AC=1, P=1

    ; 2. Carry Out (CY)
    MOV A, #0FFH        ; A = 255
    ADD A, #01H         ; A = 0x00 -> CY=1, AC=1, OV=0, P=0

    ; 3. SUBB borrow
    CLR C
    MOV A, #10H
    SUBB A, #20H        ; 0x10 - 0x20 -> 0xF0, CY=1 (borrow)

    ; 4. Multiplication and Division
    MOV A, #12H
    MOV B, #04H
    MUL AB              ; A * B = 0x12 * 4 = 0x48 -> A=0x48, B=0x00, OV=0

FINISH:
    SJMP FINISH
`,
  }
];
