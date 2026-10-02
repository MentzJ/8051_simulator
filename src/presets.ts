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
  },
  {
    id: 'square-wave',
    name: 'Timer 0 Square Wave (50 Cycles)',
    description: 'Generates a square wave by toggling ACC.0 every 50 machine cycles using Timer 0 in Mode 2 (8-bit auto-reload) and interrupt vector 000BH.',
    code: `; ==========================================
; Timer 0 Mode 2 Square Wave Generator
; Toggles ACC.0 every 50 clock cycles via
; Timer 0 auto-reload interrupt at vector 000BH.
; ==========================================
ORG 0000H
    LJMP MAIN

ORG 000BH
    ; Timer 0 Interrupt Service Routine (ISR)
    CPL ACC.0           ; Toggle square wave output at ACC.0
    RETI                ; Return from interrupt (clears latch & restores PC)

MAIN:
    MOV A, #00H         ; Square wave starts low (ACC.0 = 0)
    MOV TMOD, #02H      ; Timer 0 in Mode 2 (8-bit auto-reload, C/T=0)
    MOV TH0, #0CEH      ; Auto-reload value = 256 - 50 = 206 (0xCE)
    MOV TL0, #0CEH      ; Initial counter value
    MOV IE, #82H        ; Enable Global Interrupts (EA=1) & Timer 0 (ET0=1)
    SETB TR0            ; Start Timer 0

LOOP:
    SJMP LOOP           ; Main loop idling, awaiting timer interrupts
`,
  },
  {
    id: 'seven-seg-counter',
    name: '7-Segment & LED Counter (Port 1)',
    description: 'Cycles digits 0 through 9 on the Port 1 common-anode 7-segment display and 8-LED bar graph using standard active-low segment patterns.',
    code: `; ==========================================
; 7-Segment & LED Digit Counter (Port 1)
; Common-anode active-low patterns (P1.0=a..P1.6=g, P1.7=dp)
; Digits: 0=C0H, 1=F9H, 2=A4H, 3=B0H, 4=99H,
;         5=92H, 6=82H, 7=F8H, 8=80H, 9=90H
; ==========================================
ORG 0000H
    LJMP START

START:
    ; Initialize segment pattern table in RAM 30H..39H
    MOV 30H, #0C0H      ; '0'
    MOV 31H, #0F9H      ; '1'
    MOV 32H, #0A4H      ; '2'
    MOV 33H, #0B0H      ; '3'
    MOV 34H, #099H      ; '4'
    MOV 35H, #092H      ; '5'
    MOV 36H, #082H      ; '6'
    MOV 37H, #0F8H      ; '7'
    MOV 38H, #080H      ; '8'
    MOV 39H, #090H      ; '9'

CYCLE:
    MOV R0, #30H        ; Pointer to first digit pattern
    MOV R1, #0AH        ; 10 digits to display

NEXT_DIGIT:
    MOV A, @R0          ; Read segment byte
    MOV P1, A           ; Output to Port 1 (LEDs + 7-segment display)
    INC R0              ; Advance pointer
    DJNZ R1, NEXT_DIGIT ; Step through 0..9

    SJMP CYCLE          ; Repeat counter sequence
`,
  },
  {
    id: 'dip-switch-echo',
    name: 'DIP Switch to LED Echo (P2 -> P1)',
    description: 'Reads the physical state of Port 2 (interactive 8-DIP switches) and immediately reflects them onto Port 1 LEDs and 7-Segment display.',
    code: `; ==========================================
; DIP Switch Input Echo (P2 -> P1)
; Quasi-bidirectional demo:
; P2 latch is set to 0xFF so external DIP switches
; can freely pull individual pins to GND (0).
; The physical state is read and piped to Port 1.
; ==========================================
ORG 0000H
    MOV P2, #0FFH       ; Set Port 2 latch high (enables external inputs)

POLL_LOOP:
    MOV A, P2           ; Read physical pin state of Port 2
    MOV P1, A           ; Output directly to Port 1 LEDs & 7-segment
    SJMP POLL_LOOP      ; Continuously poll switches
`,
  },
  {
    id: 'uart-terminal',
    name: 'UART Terminal: Greeting & Echo',
    description: 'Configures Timer 1 in Mode 2 for 9600 baud, sends "8051 READY" to the virtual terminal, then echos back any characters typed by the user.',
    code: `; ==========================================
; Virtual UART Terminal: Hello & Echo Demo
; Configures Timer 1 Mode 2 auto-reload (9600 baud),
; sets SCON Mode 1 (8-bit UART, REN=1), transmits
; greeting, and echoes incoming user keystrokes.
; ==========================================
ORG 0000H
    LJMP INIT

INIT:
    ; 1. Configure Timer 1 for standard baud rate generation
    MOV TMOD, #20H      ; Timer 1 in Mode 2 (8-bit auto-reload)
    MOV TH1, #0FDH      ; 9600 baud reload value
    MOV TL1, #0FDH
    SETB TR1            ; Start Timer 1

    ; 2. Configure Serial Port
    MOV SCON, #50H      ; Mode 1 (8-bit UART), REN=1 (Receiver Enabled)

    ; 3. Transmit greeting: "8051 OK" + CRLF
    MOV A, #38H         ; '8'
    ACALL SEND_CHAR
    MOV A, #30H         ; '0'
    ACALL SEND_CHAR
    MOV A, #35H         ; '5'
    ACALL SEND_CHAR
    MOV A, #31H         ; '1'
    ACALL SEND_CHAR
    MOV A, #20H         ; ' '
    ACALL SEND_CHAR
    MOV A, #4FH         ; 'O'
    ACALL SEND_CHAR
    MOV A, #4BH         ; 'K'
    ACALL SEND_CHAR
    MOV A, #0DH         ; '\\r'
    ACALL SEND_CHAR
    MOV A, #0AH         ; '\\n'
    ACALL SEND_CHAR

ECHO_LOOP:
    ; 4. Wait for incoming user typing, then echo it back
    ACALL RECV_CHAR     ; Wait for char -> returns in A
    ACALL SEND_CHAR     ; Echo character back to terminal
    SJMP ECHO_LOOP

; --- Subroutines ---

SEND_CHAR:
    MOV SBUF, A         ; Write byte to serial buffer
WAIT_TX:
    JNB TI, WAIT_TX     ; Wait until transmission finishes
    CLR TI              ; Clear TI flag for next transmit
    RET

RECV_CHAR:
WAIT_RX:
    JNB RI, WAIT_RX     ; Wait until character received
    MOV A, SBUF         ; Read byte from serial buffer
    CLR RI              ; Clear RI flag (enables next reception)
    RET
`,
  },
  {
    id: 'xram-buffer',
    name: 'External RAM (XRAM) 64KB Buffer Demo',
    description: 'Writes a test sequence into 64KB external memory at 0x2000 using MOVX @DPTR, A, then reads the data back to verify.',
    code: `; ==========================================
; 64KB External Data Memory (XRAM) Demo
; Uses 16-bit DPTR to write 8 bytes into
; external RAM at address 2000H using MOVX.
; ==========================================
ORG 0000H
    LJMP START

START:
    MOV DPTR, #2000H    ; Point to base of external buffer at 0x2000
    MOV R0, #08H        ; Write 8 bytes
    MOV A, #11H         ; Initial pattern value

WRITE_LOOP:
    MOVX @DPTR, A       ; Write ACC to XRAM[DPTR]
    INC DPTR            ; Advance 16-bit pointer
    ADD A, #11H         ; Next pattern byte (22H, 33H, ...)
    DJNZ R0, WRITE_LOOP ; Loop until 8 bytes written

READ_VERIFY:
    MOV DPTR, #2000H    ; Reset pointer to 0x2000
    MOV R0, #08H        ; Read count

READ_LOOP:
    MOVX A, @DPTR       ; Read byte from XRAM[DPTR] into ACC
    MOV P1, A           ; Output to Port 1 LEDs for visual feedback
    INC DPTR            ; Advance pointer
    DJNZ R0, READ_LOOP  ; Loop through external buffer

HALT:
    SJMP HALT           ; Complete
`,
  },
];
