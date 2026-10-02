import { CPU8051 } from './cpu.js';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  CpuStateSnapshot,
} from './types.js';

const cpu = new CPU8051();

let isRunning = false;
let isHalted = false;
let speed: '1hz' | '10hz' | 'max' = '10hz';
let totalCycles = 0;
let instructionCount = 0;
let timerId: ReturnType<typeof setTimeout> | null = null;

// Cache previous RAM snapshot to compute diffs
const prevRam = new Uint8Array(256);

function captureState(cyclesElapsedInStep: number = 0): CpuStateSnapshot {
  return {
    pc: cpu.pc,
    sp: cpu.sp,
    psw: cpu.psw,
    acc: cpu.acc,
    b: cpu.b,
    dptr: cpu.dptr,
    dph: cpu.dph,
    dpl: cpu.dpl,
    bank: cpu.bank,
    r: Array.from({ length: 8 }, (_, i) => cpu.getRegister(i)),
    p1: cpu.readP1Pin(),
    p1Latch: cpu.p1Latch,
    p1External: cpu.p1External,
    p2: cpu.readP2Pin(),
    p2Latch: cpu.p2Latch,
    p2External: cpu.p2External,
    scon: cpu.scon,
    sbufTx: cpu.sbufTx,
    sbufRx: cpu.sbufRx,
    uartOutput: cpu.uartOutput,
    isUartBusy: cpu.isUartTxBusy,
    baudCycles: cpu.calculateBaudDurationCycles(),
    cyclesElapsed: cyclesElapsedInStep,
    totalCycles,
    instructionCount,
    isRunning,
    isHalted,
  };
}

/**
 * Computes memory diffs and dispatches STATE_DIFF to the main UI thread.
 */
function sendStateDiff(cyclesElapsed: number = 0, sendFullRam: boolean = false) {
  const dirtyRam: { address: number; value: number }[] = [];
  const dirtyXram: { address: number; value: number }[] = [];

  // Check 128 bytes of lower internal RAM
  for (let i = 0; i < 128; i++) {
    if (sendFullRam || cpu.ram[i] !== prevRam[i]) {
      dirtyRam.push({ address: i, value: cpu.ram[i] });
      prevRam[i] = cpu.ram[i];
    }
  }

  // Collect modified external RAM (XRAM)
  for (const addr of cpu.dirtyXram) {
    dirtyXram.push({ address: addr, value: cpu.xram[addr] });
  }
  cpu.clearDirtyXram();

  const msg: WorkerToMainMessage = {
    type: 'STATE_DIFF',
    state: captureState(cyclesElapsed),
    dirtyRam,
    dirtyXram,
  };

  self.postMessage(msg);
}

function stopExecution() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
  isRunning = false;
}

function checkHaltCondition(): boolean {
  // 8051 self-jump: SJMP $ (0x80 0xFE)
  const op = cpu.rom[cpu.pc];
  const nxt = cpu.rom[(cpu.pc + 1) & 0xffff];
  if (op === 0x80 && nxt === 0xfe) {
    isHalted = true;
    stopExecution();
    return true;
  }
  return false;
}

function stepSingle(): number {
  if (checkHaltCondition()) {
    sendStateDiff(0);
    return 0;
  }

  try {
    const res = cpu.step();
    totalCycles += res.cycles;
    instructionCount++;
    checkHaltCondition();
    sendStateDiff(res.cycles);
    return res.cycles;
  } catch (err: any) {
    stopExecution();
    self.postMessage({
      type: 'ERROR',
      message: err?.message || String(err),
    } satisfies WorkerToMainMessage);
    return 0;
  }
}

/**
 * 60 FPS batch runner for full 12 MHz simulation performance.
 * Runs N cycles per frame chunk and sends a consolidated diff.
 */
function runBatch() {
  if (!isRunning || isHalted) return;

  if (speed === '1hz') {
    stepSingle();
    if (isRunning && !isHalted) {
      timerId = setTimeout(runBatch, 1000);
    }
    return;
  }

  if (speed === '10hz') {
    stepSingle();
    if (isRunning && !isHalted) {
      timerId = setTimeout(runBatch, 100);
    }
    return;
  }

  // Max speed: ~20,000 - 50,000 machine cycles per 16ms frame (approx 12-24 MHz clock)
  const targetBatchCycles = 30000;
  let batchCycles = 0;

  try {
    while (batchCycles < targetBatchCycles && isRunning && !isHalted) {
      if (checkHaltCondition()) {
        break;
      }
      const res = cpu.step();
      batchCycles += res.cycles;
      totalCycles += res.cycles;
      instructionCount++;
    }

    sendStateDiff(batchCycles);

    if (isRunning && !isHalted) {
      timerId = setTimeout(runBatch, 16);
    }
  } catch (err: any) {
    stopExecution();
    self.postMessage({
      type: 'ERROR',
      message: err?.message || String(err),
    } satisfies WorkerToMainMessage);
  }
}

// Listen for incoming messages from Main thread
self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'LOAD': {
      stopExecution();
      if (msg.reset) {
        cpu.reset();
        totalCycles = 0;
        instructionCount = 0;
        isHalted = false;
        prevRam.fill(0);
      }
      cpu.loadProgram(msg.code, 0);
      sendStateDiff(0, true);
      break;
    }

    case 'RESET': {
      stopExecution();
      cpu.reset();
      totalCycles = 0;
      instructionCount = 0;
      isHalted = false;
      prevRam.fill(0);
      if (msg.code) {
        cpu.loadProgram(msg.code, 0);
      }
      sendStateDiff(0, true);
      break;
    }

    case 'STEP': {
      stopExecution();
      stepSingle();
      break;
    }

    case 'RUN': {
      if (!isHalted) {
        if (msg.speed) speed = msg.speed;
        stopExecution();
        isRunning = true;
        runBatch();
      }
      break;
    }

    case 'PAUSE': {
      stopExecution();
      sendStateDiff(0);
      break;
    }

    case 'SET_SPEED': {
      speed = msg.speed;
      break;
    }

    case 'SET_PIN': {
      const bitMask = 1 << msg.pin;
      if (msg.port === 1) {
        if (msg.value) cpu.p1External |= bitMask;
        else cpu.p1External &= ~bitMask;
      } else if (msg.port === 2) {
        if (msg.value) cpu.p2External |= bitMask;
        else cpu.p2External &= ~bitMask;
      }
      sendStateDiff(0);
      break;
    }

    case 'SET_PORT_EXTERNAL': {
      if (msg.port === 1) cpu.p1External = msg.value & 0xff;
      else if (msg.port === 2) cpu.p2External = msg.value & 0xff;
      sendStateDiff(0);
      break;
    }

    case 'RECEIVE_UART': {
      cpu.receiveUart(msg.input);
      sendStateDiff(0);
      break;
    }

    case 'CLEAR_UART': {
      cpu.clearUartOutput();
      sendStateDiff(0);
      break;
    }

    case 'REQUEST_XRAM': {
      const offset = Math.max(0, Math.min(65535, msg.offset));
      const len = Math.max(1, Math.min(1024, msg.length));
      const chunk = Array.from(cpu.xram.subarray(offset, Math.min(65536, offset + len)));
      self.postMessage({
        type: 'XRAM_CHUNK',
        offset,
        data: chunk,
      } satisfies WorkerToMainMessage);
      break;
    }

    case 'REQUEST_FULL_RAM': {
      self.postMessage({
        type: 'FULL_RAM',
        ram: Array.from(cpu.ram.subarray(0, 128)),
      } satisfies WorkerToMainMessage);
      break;
    }
  }
};
