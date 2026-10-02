import React, { useState, useEffect, useCallback, useRef } from 'react';
import { assemble, type AssemblyResult } from './assembler.js';
import { DEMO_PRESETS, type DemoPreset } from './presets.js';
import { Header } from './components/Header.js';
import { Controls, type ExecutionSpeed } from './components/Controls.js';
import { CodeEditor } from './components/CodeEditor.js';
import { RegisterDashboard } from './components/RegisterDashboard.js';
import { RamGrid } from './components/RamGrid.js';
import { PeripheralsPanel } from './components/PeripheralsPanel.js';
import { useCpuWorker } from './useCpuWorker.js';

export function App() {
  // Selected preset and editor code
  const [currentPreset, setCurrentPreset] = useState<DemoPreset>(DEMO_PRESETS[0]);
  const [code, setCode] = useState<string>(DEMO_PRESETS[0].code);

  // Assembler state
  const [assemblyResult, setAssemblyResult] = useState<AssemblyResult>(() => assemble(DEMO_PRESETS[0].code));
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [speed, setSpeed] = useState<ExecutionSpeed>('10hz');

  // Web Worker CPU Simulation Pipeline
  const {
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
    setSpeed: setWorkerSpeed,
    toggleP2Switch,
    setP2External,
    sendUartInput,
    clearUartOutput,
    requestXramWindow,
  } = useCpuWorker();

  // Previous registers cache for diff highlights in RegisterDashboard
  const prevRegsRef = useRef<typeof registers | null>(null);

  const registers = {
    a: cpuState.acc,
    b: cpuState.b,
    pc: cpuState.pc,
    sp: cpuState.sp,
    dptr: cpuState.dptr,
    dph: cpuState.dph,
    dpl: cpuState.dpl,
    psw: cpuState.psw,
    bank: cpuState.bank,
    r: cpuState.r,
  };

  // Update active editor line based on current PC
  const updateActiveLineForPC = useCallback((pcVal: number, sm: typeof assemblyResult.sourceMap) => {
    const match = sm.find((entry) => entry.pc === pcVal);
    if (match) {
      setActiveLine(match.line);
    } else {
      setActiveLine(null);
    }
  }, []);

  // Update active line when PC changes
  useEffect(() => {
    updateActiveLineForPC(cpuState.pc, assemblyResult.sourceMap);
  }, [cpuState.pc, assemblyResult.sourceMap, updateActiveLineForPC]);

  // Load program into Worker on mount
  useEffect(() => {
    const res = assemble(code);
    setAssemblyResult(res);
    if (res.errors.length === 0) {
      loadProgram(res.code, true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Assemble and load into Worker
  const compileAndLoad = useCallback(
    (sourceText: string, resetState: boolean = true) => {
      const res = assemble(sourceText);
      setAssemblyResult(res);

      if (res.errors.length === 0) {
        loadProgram(res.code, resetState);
      }
      return res;
    },
    [loadProgram]
  );

  // Handle Preset Selection
  const handleSelectPreset = (preset: DemoPreset) => {
    pause();
    setCurrentPreset(preset);
    setCode(preset.code);
    const res = assemble(preset.code);
    setAssemblyResult(res);
    if (res.errors.length === 0) {
      loadProgram(res.code, true);
    }
  };

  // Handle Step Action
  const handleStep = () => {
    if (assemblyResult.errors.length === 0 && !cpuState.isHalted) {
      prevRegsRef.current = { ...registers };
      step();
    }
  };

  // Handle Run Action
  const handleRun = () => {
    if (assemblyResult.errors.length === 0 && !cpuState.isHalted) {
      run(speed);
    }
  };

  // Handle Pause Action
  const handlePause = () => {
    pause();
  };

  // Handle Reset Action
  const handleReset = () => {
    pause();
    if (assemblyResult.errors.length === 0) {
      resetCpu(assemblyResult.code);
    } else {
      resetCpu();
    }
  };

  // Handle Assemble Button
  const handleAssemble = () => {
    compileAndLoad(code, true);
  };

  // Handle Speed Change
  const handleChangeSpeed = (newSpeed: ExecutionSpeed) => {
    setSpeed(newSpeed);
    setWorkerSpeed(newSpeed);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#070a12] text-slate-100 font-sans">
      {/* Top Header */}
      <Header
        currentPresetId={currentPreset.id}
        onSelectPreset={handleSelectPreset}
        cycleCount={cpuState.totalCycles}
        instructionCount={cpuState.instructionCount}
        isRunning={cpuState.isRunning}
        isHalted={cpuState.isHalted}
      />

      {/* Main Content Area */}
      <main className="flex-1 p-3.5 space-y-3.5 max-w-[1700px] w-full mx-auto">
        {/* Worker Error Banner (if any) */}
        {workerError && (
          <div className="bg-rose-950/80 border border-rose-700/60 text-rose-200 px-4 py-2.5 rounded-xl text-xs font-mono flex items-center justify-between">
            <span>Simulation Worker Error: {workerError}</span>
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-0.5 bg-rose-800 hover:bg-rose-700 rounded text-[11px]"
            >
              Reset Core
            </button>
          </div>
        )}

        {/* Middle Control Bar */}
        <Controls
          isRunning={cpuState.isRunning}
          onStep={handleStep}
          onRun={handleRun}
          onPause={handlePause}
          onReset={handleReset}
          onAssemble={handleAssemble}
          speed={speed}
          onChangeSpeed={handleChangeSpeed}
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
            <RegisterDashboard
              registers={registers}
              prevRegisters={prevRegsRef.current}
            />
          </div>
        </div>

        {/* Middle: Visual Peripherals Panel (P1 LEDs, 7-Segment, P2 DIP Switches, UART Terminal) */}
        <div>
          <PeripheralsPanel
            p1Pin={cpuState.p1}
            p1Latch={cpuState.p1Latch}
            p1External={cpuState.p1External}
            p2Pin={cpuState.p2}
            p2Latch={cpuState.p2Latch}
            p2External={cpuState.p2External}
            onToggleP2Switch={toggleP2Switch}
            onSetP2External={setP2External}
            scon={cpuState.scon}
            sbufTx={cpuState.sbufTx}
            sbufRx={cpuState.sbufRx}
            uartOutput={cpuState.uartOutput}
            isUartBusy={cpuState.isUartBusy}
            baudCycles={cpuState.baudCycles}
            onSendUartInput={sendUartInput}
            onClearUartOutput={clearUartOutput}
          />
        </div>

        {/* Bottom: Tabbed Memory Inspector (Internal RAM 128B + External RAM 64KB XRAM) */}
        <div>
          <RamGrid
            ram={ram}
            modifiedAddresses={modifiedRamAddresses}
            sp={cpuState.sp}
            activeBank={cpuState.bank}
            xramWindow={xramWindow}
            xramOffset={xramWindowOffset}
            modifiedXramAddresses={modifiedXramAddresses}
            onRequestXramOffset={requestXramWindow}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
