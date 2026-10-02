import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  CpuStateSnapshot,
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './types.js';

export interface UseCpuWorkerOptions {
  initialSpeed?: '1hz' | '10hz' | 'max';
  onStateUpdate?: (state: CpuStateSnapshot) => void;
}

export function useCpuWorker(options: UseCpuWorkerOptions = {}) {
  const workerRef = useRef<Worker | null>(null);

  // CPU Registers and metrics state
  const [cpuState, setCpuState] = useState<CpuStateSnapshot>(() => ({
    pc: 0,
    sp: 0x07,
    psw: 0,
    acc: 0,
    b: 0,
    dptr: 0,
    dph: 0,
    dpl: 0,
    bank: 0,
    r: [0, 0, 0, 0, 0, 0, 0, 0],
    p1: 0xff,
    p1Latch: 0xff,
    p1External: 0xff,
    p2: 0xff,
    p2Latch: 0xff,
    p2External: 0xff,
    scon: 0,
    sbufTx: 0,
    sbufRx: 0,
    uartOutput: '',
    isUartBusy: false,
    baudCycles: 16,
    cyclesElapsed: 0,
    totalCycles: 0,
    instructionCount: 0,
    isRunning: false,
    isHalted: false,
  }));

  // Internal RAM (128 bytes)
  const [ram, setRam] = useState<Uint8Array>(() => new Uint8Array(128));
  const [modifiedRamAddresses, setModifiedRamAddresses] = useState<Set<number>>(new Set());

  // External RAM (XRAM) window cache
  const [xramWindow, setXramWindow] = useState<Uint8Array>(() => new Uint8Array(256));
  const [xramWindowOffset, setXramWindowOffset] = useState<number>(0);
  const [modifiedXramAddresses, setModifiedXramAddresses] = useState<Set<number>>(new Set());

  // Error state
  const [workerError, setWorkerError] = useState<string | null>(null);

  // Initialize Worker
  useEffect(() => {
    if (typeof Worker === 'undefined') return;

    const worker = new Worker(new URL('./cpu.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'STATE_DIFF': {
          setCpuState(msg.state);

          // Apply dirty RAM updates
          if (msg.dirtyRam && msg.dirtyRam.length > 0) {
            setRam((prev) => {
              const next = new Uint8Array(prev);
              const changed = new Set<number>();
              for (const { address, value } of msg.dirtyRam) {
                if (address < 128) {
                  next[address] = value;
                  changed.add(address);
                }
              }
              setModifiedRamAddresses(changed);
              return next;
            });
          }

          // Apply dirty XRAM tracking
          if (msg.dirtyXram && msg.dirtyXram.length > 0) {
            setModifiedXramAddresses((prev) => {
              const next = new Set(prev);
              for (const { address } of msg.dirtyXram) {
                next.add(address);
              }
              return next;
            });

            // Update current visible XRAM window if affected
            setXramWindow((prev) => {
              let updated = false;
              const next = new Uint8Array(prev);
              for (const { address, value } of msg.dirtyXram) {
                if (address >= xramWindowOffset && address < xramWindowOffset + 256) {
                  next[address - xramWindowOffset] = value;
                  updated = true;
                }
              }
              return updated ? next : prev;
            });
          }

          options.onStateUpdate?.(msg.state);
          break;
        }

        case 'XRAM_CHUNK': {
          if (msg.offset === xramWindowOffset) {
            setXramWindow(new Uint8Array(msg.data));
          }
          break;
        }

        case 'FULL_RAM': {
          setRam(new Uint8Array(msg.ram));
          break;
        }

        case 'ERROR': {
          setWorkerError(msg.message);
          break;
        }
      }
    };

    worker.onerror = (err) => {
      console.error('CPU Worker error:', err);
      setWorkerError(err.message || 'Worker error occurred');
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [xramWindowOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const postToWorker = useCallback((msg: MainToWorkerMessage) => {
    workerRef.current?.postMessage(msg);
  }, []);

  // Controls
  const loadProgram = useCallback((code: ArrayLike<number>, reset: boolean = true) => {
    setWorkerError(null);
    setModifiedRamAddresses(new Set());
    setModifiedXramAddresses(new Set());
    postToWorker({
      type: 'LOAD',
      code: Array.from(code),
      reset,
    });
  }, [postToWorker]);

  const resetCpu = useCallback((code?: ArrayLike<number>) => {
    setWorkerError(null);
    setModifiedRamAddresses(new Set());
    setModifiedXramAddresses(new Set());
    postToWorker({
      type: 'RESET',
      code: code ? Array.from(code) : undefined,
    });
  }, [postToWorker]);

  const step = useCallback(() => {
    postToWorker({ type: 'STEP' });
  }, [postToWorker]);

  const run = useCallback((speed: '1hz' | '10hz' | 'max') => {
    postToWorker({ type: 'RUN', speed });
  }, [postToWorker]);

  const pause = useCallback(() => {
    postToWorker({ type: 'PAUSE' });
  }, [postToWorker]);

  const setSpeed = useCallback((speed: '1hz' | '10hz' | 'max') => {
    postToWorker({ type: 'SET_SPEED', speed });
  }, [postToWorker]);

  const toggleP2Switch = useCallback((pin: number) => {
    setCpuState((prev) => {
      const nextExt = prev.p2External ^ (1 << pin);
      postToWorker({
        type: 'SET_PORT_EXTERNAL',
        port: 2,
        value: nextExt,
      });
      return {
        ...prev,
        p2External: nextExt,
        p2: prev.p2Latch & nextExt,
      };
    });
  }, [postToWorker]);

  const setP2External = useCallback((value: number) => {
    setCpuState((prev) => {
      const nextExt = value & 0xff;
      postToWorker({
        type: 'SET_PORT_EXTERNAL',
        port: 2,
        value: nextExt,
      });
      return {
        ...prev,
        p2External: nextExt,
        p2: prev.p2Latch & nextExt,
      };
    });
  }, [postToWorker]);

  const sendUartInput = useCallback((input: string) => {
    postToWorker({ type: 'RECEIVE_UART', input });
  }, [postToWorker]);

  const clearUartOutput = useCallback(() => {
    setCpuState((prev) => ({ ...prev, uartOutput: '' }));
    postToWorker({ type: 'CLEAR_UART' });
  }, [postToWorker]);

  const requestXramWindow = useCallback((offset: number) => {
    const clampedOffset = Math.max(0, Math.min(65536 - 256, offset & ~0x0f));
    setXramWindowOffset(clampedOffset);
    postToWorker({
      type: 'REQUEST_XRAM',
      offset: clampedOffset,
      length: 256,
    });
  }, [postToWorker]);

  return {
    cpuState,
    ram,
    modifiedRamAddresses,
    xramWindow,
    xramWindowOffset,
    modifiedXramAddresses,
    workerError,
    loadProgram,
    resetCpu,
    step,
    run,
    pause,
    setSpeed,
    toggleP2Switch,
    setP2External,
    sendUartInput,
    clearUartOutput,
    requestXramWindow,
  };
}
