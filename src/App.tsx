import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CPU8051, SFR } from './index';
import { assemble, type AssemblyResult } from './assembler';
import { DEMO_PRESETS, type DemoPreset } from './presets';
import { Header } from './components/Header';
import { Controls, type ExecutionSpeed } from './components/Controls';
import { CodeEditor } from './components/CodeEditor';
import { RegisterDashboard } from './components/RegisterDashboard';
import { RamGrid } from './components/RamGrid';

export function App() {
  const cpuRef = useRef<CPU8051>(new CPU8051());
  const cpu = cpuRef.current;

  // Selected preset and editor code
  const [currentPreset, setCurrentPreset] = useState<DemoPreset>(DEMO_PRESETS[0]);
  const [code, setCode] = useState<string>(DEMO_PRESETS[0].code);

  // Assembler state
  const [assemblyResult, setAssemblyResult] = useState<AssemblyResult>(() => assemble(DEMO_PRESETS[0].code));
  const [activeLine, setActiveLine] = useState<number | null>(null);

  // Runtime metrics & status
  const [cycleCount, setCycleCount] = useState<number>(0);
  const [instructionCount, setInstructionCount] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isHalted, setIsHalted] = useState<boolean>(false);
  const [speed, setSpeed] = useState<ExecutionSpeed>('10hz');

  // Registers snapshot
  const readRegisters = useCallback(() => {
    return {
      a: cpu.acc,
      b: cpu.b,
      pc: cpu.pc,
      sp: cpu.sp,
      dptr: cpu.dptr,
      dph: cpu.dph,
      dpl: cpu.dpl,
      psw: cpu.psw,
      bank: cpu.bank,
      r: Array.from({ length: 8 }, (_, i) => cpu.getRegister(i)),
    };
  }, [cpu]);

  const [registers, setRegisters] = useState(readRegisters);
  const [prevRegisters, setPrevRegisters] = useState<typeof registers | null>(null);

  // RAM state (0x00 - 0x7F) and change tracking
  const [ram, setRam] = useState<Uint8Array>(() => new Uint8Array(cpu.ram.subarray(0, 128)));
  const [modifiedAddresses, setModifiedAddresses] = useState<Set<number>>(new Set());

  // Update active editor line based on current PC
  const updateActiveLineForPC = useCallback((pcVal: number, sm: typeof assemblyResult.sourceMap) => {
    const match = sm.find((entry) => entry.pc === pcVal);
    if (match) {
      setActiveLine(match.line);
    } else {
      // If exact PC is inside a multi-byte instruction or branch
      setActiveLine(null);
    }
  }, []);

  // Assemble and load program into CPU
  const compileAndLoad = useCallback(
    (sourceText: string, resetState: boolean = true) => {
      const res = assemble(sourceText);
      setAssemblyResult(res);

      if (res.errors.length === 0) {
        if (resetState) {
          cpu.reset();
          setCycleCount(0);
          setInstructionCount(0);
          setIsHalted(false);
          setIsRunning(false);
          setModifiedAddresses(new Set());
        }

        // Load machine code into ROM
        cpu.loadProgram(res.code, 0);

        // Update state views
        setRegisters(readRegisters());
        setPrevRegisters(null);
        setRam(new Uint8Array(cpu.ram.subarray(0, 128)));
        updateActiveLineForPC(cpu.pc, res.sourceMap);
      }
      return res;
    },
    [cpu, readRegisters, updateActiveLineForPC]
  );

  // Initialize on mount
  useEffect(() => {
    compileAndLoad(code, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Preset Selection
  const handleSelectPreset = (preset: DemoPreset) => {
    setIsRunning(false);
    setCurrentPreset(preset);
    setCode(preset.code);
    compileAndLoad(preset.code, true);
  };

  // Perform single step execution
  const handleStep = useCallback(() => {
    if (assemblyResult.errors.length > 0) return;

    // Check if CPU is currently on a self-jump (infinite halt like SJMP $)
    const currentOpcode = cpu.rom[cpu.pc];
    const nextByte = cpu.rom[(cpu.pc + 1) & 0xffff];
    if (currentOpcode === 0x80 && nextByte === 0xfe) {
      setIsHalted(true);
      setIsRunning(false);
      return;
    }

    // Save RAM snapshot to detect modified cells
    const oldRam = new Uint8Array(cpu.ram.subarray(0, 128));
    const oldRegs = readRegisters();

    try {
      const res = cpu.step();

      // Detect which RAM addresses changed
      const changed = new Set<number>();
      for (let i = 0; i < 128; i++) {
        if (cpu.ram[i] !== oldRam[i]) {
          changed.add(i);
        }
      }

      setPrevRegisters(oldRegs);
      const newRegs = readRegisters();
      setRegisters(newRegs);
      setRam(new Uint8Array(cpu.ram.subarray(0, 128)));
      setModifiedAddresses(changed);
      setCycleCount((c) => c + res.cycles);
      setInstructionCount((i) => i + 1);

      updateActiveLineForPC(cpu.pc, assemblyResult.sourceMap);

      // Check if newly reached instruction is an infinite halt
      const newOp = cpu.rom[cpu.pc];
      const newNext = cpu.rom[(cpu.pc + 1) & 0xffff];
      if (newOp === 0x80 && newNext === 0xfe) {
        setIsHalted(true);
        setIsRunning(false);
      } else {
        setIsHalted(false);
      }
    } catch (err) {
      console.error('CPU Execution error:', err);
      setIsRunning(false);
    }
  }, [assemblyResult, cpu, readRegisters, updateActiveLineForPC]);

  // Handle Reset Action
  const handleReset = () => {
    setIsRunning(false);
    setIsHalted(false);
    compileAndLoad(code, true);
  };

  // Handle Assemble / Reload button
  const handleAssemble = () => {
    compileAndLoad(code, true);
  };

  // Run / Pause Toggle
  const handleRun = () => {
    if (assemblyResult.errors.length === 0 && !isHalted) {
      setIsRunning(true);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  // Execution Timer Loop for Run mode
  useEffect(() => {
    if (!isRunning || isHalted) return;

    if (speed === '1hz') {
      const timer = setInterval(() => {
        handleStep();
      }, 1000);
      return () => clearInterval(timer);
    } else if (speed === '10hz') {
      const timer = setInterval(() => {
        handleStep();
      }, 100);
      return () => clearInterval(timer);
    } else {
      // Max speed: RAF batch execution
      let rafId: number;
      const runBatch = () => {
        // Execute batch of up to 50 instructions per frame
        for (let i = 0; i < 50; i++) {
          const curOp = cpu.rom[cpu.pc];
          const nxt = cpu.rom[(cpu.pc + 1) & 0xffff];
          if (curOp === 0x80 && nxt === 0xfe) {
            setIsHalted(true);
            setIsRunning(false);
            break;
          }
          cpu.step();
        }

        // Update UI after batch
        setRegisters(readRegisters());
        setRam(new Uint8Array(cpu.ram.subarray(0, 128)));
        updateActiveLineForPC(cpu.pc, assemblyResult.sourceMap);

        if (!isHalted) {
          rafId = requestAnimationFrame(runBatch);
        }
      };

      rafId = requestAnimationFrame(runBatch);
      return () => cancelAnimationFrame(rafId);
    }
  }, [isRunning, isHalted, speed, handleStep, cpu, readRegisters, assemblyResult, updateActiveLineForPC]);

  return (
    <div className="flex min-h-screen flex-col bg-[#070a12] text-slate-100 font-sans">
      {/* Top Header */}
      <Header
        currentPresetId={currentPreset.id}
        onSelectPreset={handleSelectPreset}
        cycleCount={cycleCount}
        instructionCount={instructionCount}
        isRunning={isRunning}
        isHalted={isHalted}
      />

      {/* Main Content Area */}
      <main className="flex-1 p-3.5 space-y-3.5 max-w-[1700px] w-full mx-auto">
        {/* Middle Control Bar */}
        <Controls
          isRunning={isRunning}
          onStep={handleStep}
          onRun={handleRun}
          onPause={handlePause}
          onReset={handleReset}
          onAssemble={handleAssemble}
          speed={speed}
          onChangeSpeed={setSpeed}
          isAssembled={assemblyResult.errors.length === 0}
          hasErrors={assemblyResult.errors.length > 0}
        />

        {/* Top Split View: Code Editor (Left) & Register Dashboard (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch min-h-[460px]">
          {/* Left: Code Editor (7 cols on desktop) */}
          <div className="lg:col-span-7 h-[460px]">
            <CodeEditor
              code={code}
              onChangeCode={(newCode) => {
                setCode(newCode);
                compileAndLoad(newCode, false);
              }}
              activeLine={activeLine}
              sourceMap={assemblyResult.sourceMap}
              errors={assemblyResult.errors}
              byteCount={assemblyResult.byteCount}
            />
          </div>

          {/* Right: Register Dashboard (5 cols on desktop) */}
          <div className="lg:col-span-5 h-[460px]">
            <RegisterDashboard registers={registers} prevRegisters={prevRegisters} />
          </div>
        </div>

        {/* Bottom: 16x8 Hex Grid showing Internal RAM (0x00–0x7F) */}
        <div>
          <RamGrid
            ram={ram}
            modifiedAddresses={modifiedAddresses}
            sp={registers.sp}
            activeBank={registers.bank}
          />
        </div>
      </main>
    </div>
  );
}
export default App;
