"use client";

import { useState, useRef } from "react";

type Telemetry = {
  forceRaw: number;
  angleDev: number;
  depthCm: number;
  bpm: number;
  compressions: number;
  goodPct: number;
};

// Hand-drawn styling utilities
const WOBBLY_BORDERS = [
  "255px 15px 225px 15px / 15px 225px 15px 255px",
  "15px 225px 15px 255px / 255px 15px 225px 15px",
  "225px 15px 255px 15px / 15px 255px 15px 225px",
];

export default function Dashboard() {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>("");

  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  const connectDevice = async () => {
    const nav = navigator as any;
    if (!nav.serial) {
      setError("Web Serial API not supported in this browser. Please use Chrome/Edge.");
      return;
    }

    try {
      // Prompt user to select port (COM7 expected)
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 9600 });
      setConnected(true);
      setError("");

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }
        if (value) {
          buffer += value;
          const lines = buffer.split("\n");
          // The last element is the incomplete string, keep it in buffer
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const data = JSON.parse(trimmed) as Telemetry;
              if (data && typeof data.bpm === 'number' && typeof data.depthCm === 'number' && typeof data.angleDev === 'number') {
                setTelemetry(data);
              }
            } catch (err) {
              console.warn("Failed to parse JSON segment:", trimmed);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to connect to device");
      setConnected(false);
    }
  };

  // derived states for AHA standards validation
  const isAngleBad = telemetry ? telemetry.angleDev > 15.0 : false;
  const isBpmBad = telemetry ? telemetry.bpm < 100 || telemetry.bpm > 120 : false;
  // depth ideal 5-6cm
  const isDepthBad = telemetry ? telemetry.depthCm < 5 || telemetry.depthCm > 6 : false;

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 md:px-0">
      {/* Header element */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-12">
        <h1 className="font-heading text-5xl md:text-6xl text-[#2d2d2d] tracking-wider mb-6 md:mb-0 rotate-1">
          CPR Glove Monitor
        </h1>
        
        <div className="flex flex-col items-end">
          <button
            onClick={connectDevice}
            disabled={connected}
            className={`font-heading text-2xl px-6 py-3 border-[3px] border-[#2d2d2d] bg-[#fdfbf7] ${
              connected 
                ? 'opacity-50 cursor-not-allowed translate-x-[4px] translate-y-[4px]' 
                : 'hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#2d2d2d] shadow-[4px_4px_0px_0px_#2d2d2d] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]'
            } transition-all duration-200 -rotate-2 relative`}
            style={{ borderRadius: WOBBLY_BORDERS[0] }}
          >
            {connected ? "Connected to Device" : "Connect to COM7"}
          </button>
          {error && <p className="text-[#ff4d4d] font-body mt-2 -rotate-1 text-lg">{error}</p>}
        </div>
      </div>

      {!connected && !error && (
        <div className="text-center mt-20 border-dashed border-4 border-[#e5e0d8] p-12 rounded-2xl relative">
          {/* Decorative tape */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-8 bg-[#e5e0d8]/80 rotate-2 mix-blend-multiply"></div>
          
          <p className="font-heading text-4xl text-[#2d2d2d] opacity-50 -rotate-1">
            Waiting for device connection...
          </p>
          <p className="font-body text-xl text-[#2d2d2d] opacity-40 mt-4">
            (Plug in Arduino via USB and click Connect)
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 transition-opacity duration-500 ${connected ? 'opacity-100' : 'opacity-0 pointer-events-none hidden'}`}>
        
        {/* BPM Monitor Card */}
        <div 
          className="relative bg-[#fdfbf7] border-[3px] border-[#2d2d2d] p-6 shadow-[4px_4px_0px_0px_#2d2d2d] rotate-1"
          style={{ borderRadius: WOBBLY_BORDERS[1] }}
        >
          {/* Visual tape */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-6 bg-[#e5e0d8]/80 -rotate-2 mix-blend-multiply"></div>
          
          <h2 className="font-heading text-2xl text-[#2d2d2d] border-b-2 border-dashed border-[#2d2d2d]/30 pb-2 mb-4">
            Compression Rate (BPM)
          </h2>
          
          <div className="flex items-end gap-3">
            <span className={`font-heading text-6xl ${isBpmBad ? 'text-[#ff4d4d]' : 'text-[#2d5da1]'}`}>
              {telemetry?.bpm !== undefined ? telemetry.bpm.toFixed(1) : "---"}
            </span>
            <span className="font-body text-xl mb-2 text-[#2d2d2d]/60">bpm</span>
          </div>
          
          <div className="mt-4 font-body text-xl">
            {isBpmBad ? (
              <span className="text-[#ff4d4d] flex items-center gap-2 font-bold decoration-[3px] underline decoration-wavy underline-offset-4 decoration-[#ff4d4d]">
                <span className="inline-block border-2 border-[#ff4d4d] rounded-full w-4 h-4 flex-shrink-0 bg-[#ff4d4d]/20"></span>
                Target: 100-120 BPM
              </span>
            ) : (
              <span className="text-[#2d2d2d]/70 flex items-center gap-2">
                <span className="inline-block border-2 border-[#2d2d2d]/50 rounded-full w-4 h-4 flex-shrink-0"></span>
                Optimal rate
              </span>
            )}
          </div>
        </div>

        {/* Wrist Angle Card */}
        <div 
          className="relative bg-[#fdfbf7] border-[3px] border-[#2d2d2d] p-6 shadow-[4px_4px_0px_0px_#2d2d2d] -rotate-1"
          style={{ borderRadius: WOBBLY_BORDERS[2] }}
        >
          {/* Thumbtack */}
          <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#ff4d4d] border-[3px] border-[#2d2d2d] shadow-[2px_2px_0px_0px_#2d2d2d]"></div>
          
          <h2 className="font-heading text-2xl text-[#2d2d2d] border-b-2 border-dashed border-[#2d2d2d]/30 pb-2 mb-4">
            Wrist Tilt Angle
          </h2>
          
          <div className="flex items-end gap-3">
            <span className={`font-heading text-6xl ${isAngleBad ? 'text-[#ff4d4d]' : 'text-[#2d5da1]'}`}>
              {telemetry?.angleDev !== undefined ? telemetry.angleDev.toFixed(1) : "---"}&deg;
            </span>
          </div>

          <div className="mt-4 font-body text-xl">
             {isAngleBad ? (
              <span className="text-[#ff4d4d] flex items-center gap-2 font-bold decoration-[3px] underline decoration-wavy underline-offset-4 decoration-[#ff4d4d]">
                <span className="inline-block border-2 border-[#ff4d4d] rounded-full w-4 h-4 flex-shrink-0 bg-[#ff4d4d]/20"></span>
                Keep wrist straight (≤ 15°)
              </span>
            ) : (
              <span className="text-[#2d2d2d]/70 flex items-center gap-2">
                <span className="inline-block border-2 border-[#2d2d2d]/50 rounded-full w-4 h-4 flex-shrink-0"></span>
                Good posture
              </span>
            )}
          </div>
        </div>

        {/* Compression Depth Card */}
        <div 
          className="relative bg-[#fdfbf7] border-[3px] border-[#2d2d2d] p-6 shadow-[4px_4px_0px_0px_#2d2d2d] rotate-2"
          style={{ borderRadius: WOBBLY_BORDERS[0] }}
        >
          {/* Visual tape */}
          <div className="absolute top-2 -left-3 w-12 h-6 bg-[#2d5da1]/20 -rotate-45 mix-blend-multiply"></div>

          <h2 className="font-heading text-2xl text-[#2d2d2d] border-b-2 border-dashed border-[#2d2d2d]/30 pb-2 mb-4">
            Compression Depth
          </h2>
          
          <div className="flex items-end gap-3">
            <span className={`font-heading text-6xl ${isDepthBad ? 'text-[#ff4d4d]' : 'text-[#2d2d2d]'}`}>
              {telemetry?.depthCm !== undefined ? telemetry.depthCm.toFixed(1) : "---"}
            </span>
            <span className="font-body text-xl mb-2 text-[#2d2d2d]/60">cm</span>
          </div>

          <div className="mt-4 font-body text-xl">
             {isDepthBad ? (
              <span className="text-[#ff4d4d] flex items-center gap-2 font-bold decoration-[3px] underline decoration-wavy underline-offset-4 decoration-[#ff4d4d]">
                <span className="inline-block border-2 border-[#ff4d4d] rounded-full w-4 h-4 flex-shrink-0 bg-[#ff4d4d]/20"></span>
                Push 5-6 cm deep
              </span>
            ) : (
              <span className="text-[#2d2d2d]/70 flex items-center gap-2">
                <span className="inline-block border-2 border-[#2d2d2d]/50 rounded-full w-4 h-4 flex-shrink-0"></span>
                Perfect depth
              </span>
            )}
          </div>
          
          {/* Handdrawn progress bar */}
          <div className="mt-6 w-full h-10 border-[3px] border-[#2d2d2d] relative bg-[#e5e0d8]/30 overflow-hidden" style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}>
             {/* Target region markers: 5/8 to 6/8 -> 62.5% to 75% */}
             <div className="absolute top-0 bottom-0 left-[62.5%] right-[25%] border-x-4 border-dashed border-[#2d5da1]/50 bg-[#2d5da1]/10 z-0" title="Target 5-6cm" />
             
             {/* The moving fill */}
             <div 
               className={`absolute top-0 left-0 h-full border-r-[3px] border-[#2d2d2d] transition-all duration-100 ease-out z-10 ${isDepthBad ? 'bg-[#ff4d4d]' : 'bg-[#2d5da1]'}`}
               style={{ 
                 width: `${Math.min(100, Math.max(0, (telemetry?.depthCm || 0) * (100 / 8)))}%`, // assume 8cm is max visual scale
               }}
             />
          </div>
          <div className="flex justify-between mt-1 px-1 font-body text-sm text-[#2d2d2d]/60">
            <span>0</span>
            <span>2</span>
            <span>4</span>
            <span className="text-[#2d5da1] font-bold">5</span>
            <span className="text-[#2d5da1] font-bold">6</span>
            <span>8</span>
          </div>
        </div>

        {/* Session Stats (Wide) */}
        <div 
          className="relative col-span-1 md:col-span-2 bg-[#fdfbf7] border-[3px] border-[#2d2d2d] p-6 shadow-[4px_4px_0px_0px_#2d2d2d] -rotate-1"
          style={{ borderRadius: WOBBLY_BORDERS[1] }}    
        >
          {/* Thumbtacks for pinning to board */}
          <div className="absolute top-4 left-4 w-5 h-5 rounded-full bg-[#e5e0d8] border-[3px] border-[#2d2d2d] shadow-[2px_2px_0px_0px_#2d2d2d]"></div>
          <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-[#e5e0d8] border-[3px] border-[#2d2d2d] shadow-[2px_2px_0px_0px_#2d2d2d]"></div>
          
          <h2 className="font-heading text-4xl text-[#2d2d2d] border-b-[3px] border-dashed border-[#2d2d2d]/50 pb-4 mb-8 text-center mt-2">
            Session Analytics
          </h2>
          
          <div className="flex flex-col md:flex-row justify-around items-center gap-8 md:gap-4">
            <div className="text-center w-full md:w-1/2">
              <p className="font-body text-2xl text-[#2d2d2d]/80 mb-2">Total Compressions</p>
              <p className="font-heading text-7xl text-[#2d2d2d] drop-shadow-sm">
                {telemetry ? telemetry.compressions : "--"}
              </p>
            </div>
            
            <div className="h-24 w-1 border-r-[3px] border-dashed border-[#2d2d2d]/30 hidden md:block"></div>
            
            <div className="text-center w-full md:w-1/2">
              <p className="font-body text-2xl text-[#2d2d2d]/80 mb-2">Accuracy Rate</p>
              <p className={`font-heading text-7xl drop-shadow-sm ${telemetry && telemetry.goodPct >= 80 ? 'text-[#2d5da1]' : 'text-[#ff4d4d]'}`}>
                {telemetry ? `${telemetry.goodPct}%` : "--"}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
