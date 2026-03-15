"use client";

import { useState, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from "recharts";

type Telemetry = {
  forceRaw: number;
  angleDev: number;
  depthCm: number;
  bpm: number;
  compressions: number;
  goodPct: number;
};

const WOBBLY_BORDERS = [
  "255px 15px 225px 15px / 15px 225px 15px 255px",
  "15px 225px 15px 255px / 255px 15px 225px 15px",
  "225px 15px 255px 15px / 15px 255px 15px 225px",
];

export default function Dashboard() {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>("");
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  const disconnectDevice = async () => {
    if (readerRef.current) {
      await readerRef.current.cancel();
      readerRef.current = null;
    }
    setConnected(false);
    setTelemetry(null);
    setHistory([]);
  };

  const connectDevice = async () => {
    const nav = navigator as any;
    if (!nav.serial) {
      setError("Web Serial API not supported. Use Chrome/Edge.");
      return;
    }
    try {
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
        if (done) { reader.releaseLock(); break; }
        if (value) {
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const data = JSON.parse(trimmed) as Telemetry;
              if (data && typeof data.bpm === "number" && typeof data.depthCm === "number" && typeof data.angleDev === "number") {
                setTelemetry(data);
                setHistory(prev => {
                  const n = [...prev, data];
                  if (n.length > 50) n.shift();
                  return n;
                });
              }
            } catch { /* ignore bad frames */ }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect");
      setConnected(false);
    }
  };

  const isAngleBad = telemetry ? telemetry.angleDev > 15.0 : false;
  const isBpmBad   = telemetry ? telemetry.bpm < 100 || telemetry.bpm > 120 : false;
  const isDepthBad = telemetry ? telemetry.depthCm < 3 || telemetry.depthCm > 6 : false;

  /* ─── compact tooltip style ─────────────────────────────── */
  const ttStyle = { backgroundColor: "#fdfbf7", border: "2px solid #2d2d2d", fontFamily: "var(--font-body)", padding: "4px 8px", fontSize: 12 };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col px-6 py-2 w-full">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h1 className="font-heading text-4xl text-[#2d2d2d] rotate-1">CPR Glove Monitor</h1>
        <div className="flex flex-col items-end">
          <button
            onClick={connected ? disconnectDevice : connectDevice}
            className={`font-heading text-lg px-4 py-2 border-[3px] border-[#2d2d2d] bg-[#fdfbf7] -rotate-1 transition-all duration-200 ${
              connected
                ? "shadow-[3px_3px_0px_0px_#ff4d4d] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_#ff4d4d]"
                : "shadow-[3px_3px_0px_0px_#2d2d2d] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_#2d2d2d]"
            }`}
            style={{ borderRadius: WOBBLY_BORDERS[0] }}
          >
            {connected ? "Disconnect Device" : "Connect to COM7"}
          </button>
          {error && <p className="text-[#ff4d4d] font-body text-sm mt-1 -rotate-1">{error}</p>}
        </div>
      </div>

      {/* ── NOT CONNECTED placeholder ── */}
      {!connected && !error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center border-dashed border-4 border-[#e5e0d8] p-10 rounded-2xl relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-7 bg-[#e5e0d8]/80 rotate-2 mix-blend-multiply" />
            <p className="font-heading text-3xl text-[#2d2d2d] opacity-50 -rotate-1">Waiting for device connection...</p>
            <p className="font-body text-base text-[#2d2d2d] opacity-40 mt-2">(Plug in Arduino via USB and click Connect)</p>
          </div>
        </div>
      )}

      {/* ── CONNECTED LAYOUT ── */}
      {connected && (
        <div className="flex-1 flex flex-col gap-2 min-h-0">

          {/* ROW 1 — three stat cards */}
          <div className="grid grid-cols-3 gap-3 flex-shrink-0">

            {/* BPM Card */}
            <div className="relative bg-[#fdfbf7] border-[3px] border-[#2d2d2d] p-3 shadow-[3px_3px_0px_0px_#2d2d2d] rotate-1" style={{ borderRadius: WOBBLY_BORDERS[1] }}>
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-5 bg-[#e5e0d8]/80 -rotate-2 mix-blend-multiply" />
              <h2 className="font-heading text-base text-[#2d2d2d] border-b border-dashed border-[#2d2d2d]/30 pb-1 mb-2">Compression Rate</h2>
              <div className="flex items-end gap-2">
                <span className={`font-heading text-5xl leading-none ${isBpmBad ? "text-[#ff4d4d]" : "text-[#2d5da1]"}`}>
                  {telemetry?.bpm !== undefined ? telemetry.bpm.toFixed(1) : "---"}
                </span>
                <span className="font-body text-sm mb-1 text-[#2d2d2d]/60">bpm</span>
              </div>
              <div className="mt-2 font-body text-sm">
                {isBpmBad
                  ? <span className="text-[#ff4d4d] font-bold underline decoration-wavy underline-offset-2 decoration-[#ff4d4d]">Target: 100–120 BPM</span>
                  : <span className="text-[#2d2d2d]/60">✓ Optimal rate</span>}
              </div>
            </div>

            {/* Wrist Angle Card */}
            <div className="relative bg-[#fdfbf7] border-[3px] border-[#2d2d2d] p-3 shadow-[3px_3px_0px_0px_#2d2d2d] -rotate-1" style={{ borderRadius: WOBBLY_BORDERS[2] }}>
              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#ff4d4d] border-2 border-[#2d2d2d] shadow-[1px_1px_0px_0px_#2d2d2d]" />
              <h2 className="font-heading text-base text-[#2d2d2d] border-b border-dashed border-[#2d2d2d]/30 pb-1 mb-2">Wrist Tilt Angle</h2>
              <div className="flex items-end gap-2">
                <span className={`font-heading text-5xl leading-none ${isAngleBad ? "text-[#ff4d4d]" : "text-[#2d5da1]"}`}>
                  {telemetry?.angleDev !== undefined ? telemetry.angleDev.toFixed(1) : "---"}&deg;
                </span>
              </div>
              <div className="mt-2 font-body text-sm">
                {isAngleBad
                  ? <span className="text-[#ff4d4d] font-bold underline decoration-wavy underline-offset-2 decoration-[#ff4d4d]">Keep wrist straight (≤ 15°)</span>
                  : <span className="text-[#2d2d2d]/60">✓ Good posture</span>}
              </div>
            </div>

            {/* Compression Depth Card */}
            <div className="relative bg-[#fdfbf7] border-[3px] border-[#2d2d2d] p-3 shadow-[3px_3px_0px_0px_#2d2d2d] rotate-1" style={{ borderRadius: WOBBLY_BORDERS[0] }}>
              <h2 className="font-heading text-base text-[#2d2d2d] border-b border-dashed border-[#2d2d2d]/30 pb-1 mb-2">Compression Depth</h2>
              <div className="flex items-end gap-2">
                <span className={`font-heading text-5xl leading-none ${isDepthBad ? "text-[#ff4d4d]" : "text-[#2d2d2d]"}`}>
                  {telemetry?.depthCm !== undefined ? telemetry.depthCm.toFixed(1) : "---"}
                </span>
                <span className="font-body text-sm mb-1 text-[#2d2d2d]/60">cm</span>
              </div>
              <div className="mt-2 font-body text-sm mb-2">
                {isDepthBad
                  ? <span className="text-[#ff4d4d] font-bold underline decoration-wavy underline-offset-2 decoration-[#ff4d4d]">Target: 3–6 cm</span>
                  : <span className="text-[#2d2d2d]/60">✓ Perfect depth</span>}
              </div>
              {/* Compact progress bar */}
              <div className="w-full h-6 border-[2px] border-[#2d2d2d] relative bg-[#e5e0d8]/30 overflow-hidden" style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}>
                <div className="absolute top-0 bottom-0 left-[37.5%] right-[25%] bg-[#2d5da1]/15 border-x-2 border-dashed border-[#2d5da1]/40 z-0" />
                <div
                  className={`absolute top-0 left-0 h-full border-r-2 border-[#2d2d2d] transition-all duration-100 z-10 ${isDepthBad ? "bg-[#ff4d4d]" : "bg-[#2d5da1]"}`}
                  style={{ width: `${Math.min(100, Math.max(0, (telemetry?.depthCm || 0) * (100 / 8)))}%` }}
                />
              </div>
              <div className="flex justify-between mt-0.5 px-0.5 font-body text-xs text-[#2d2d2d]/50">
                <span>0</span><span>2</span>
                <span className="text-[#2d5da1] font-bold">3</span>
                <span>4</span>
                <span className="text-[#2d5da1] font-bold">6</span>
                <span>8</span>
              </div>
            </div>
          </div>

          {/* ROW 2 — Session Analytics */}
          <div className="relative bg-[#fdfbf7] border-[3px] border-[#2d2d2d] p-3 shadow-[3px_3px_0px_0px_#2d2d2d] -rotate-[0.5deg] flex-shrink-0" style={{ borderRadius: WOBBLY_BORDERS[1] }}>
            <div className="absolute top-2 left-3 w-4 h-4 rounded-full bg-[#e5e0d8] border-2 border-[#2d2d2d] shadow-[1px_1px_0px_0px_#2d2d2d]" />
            <div className="absolute top-2 right-3 w-4 h-4 rounded-full bg-[#e5e0d8] border-2 border-[#2d2d2d] shadow-[1px_1px_0px_0px_#2d2d2d]" />
            <h2 className="font-heading text-xl text-[#2d2d2d] text-center mb-2">Session Analytics</h2>
            <div className="flex justify-around items-center">
              <div className="text-center">
                <p className="font-body text-sm text-[#2d2d2d]/70">Total Compressions</p>
                <p className="font-heading text-5xl text-[#2d2d2d] leading-none">{telemetry ? telemetry.compressions : "--"}</p>
              </div>
              <div className="h-12 w-px border-r-2 border-dashed border-[#2d2d2d]/30" />
              <div className="text-center">
                <p className="font-body text-sm text-[#2d2d2d]/70">Accuracy Rate</p>
                <p className={`font-heading text-5xl leading-none ${telemetry && telemetry.goodPct >= 80 ? "text-[#2d5da1]" : "text-[#ff4d4d]"}`}>
                  {telemetry ? `${telemetry.goodPct}%` : "--"}
                </p>
              </div>
            </div>
          </div>

          {/* ROW 3 — Real-Time Graphs */}
          <div className="relative bg-[#fdfbf7] border-[3px] border-[#2d2d2d] p-3 shadow-[3px_3px_0px_0px_#2d2d2d] rotate-[0.5deg] flex-1 min-h-0" style={{ borderRadius: WOBBLY_BORDERS[2] }}>
            <div className="absolute -top-2 left-1/4 w-12 h-5 bg-[#e5e0d8]/80 rotate-2 mix-blend-multiply z-10" />
            <h2 className="font-heading text-xl text-[#2d2d2d] text-center mb-1">Real-Time Telemetry</h2>
            <div className="grid grid-cols-2 gap-3 h-[calc(100%-2rem)]">
              {/* Depth graph */}
              <div className="flex flex-col h-full">
                <h3 className="font-heading text-sm text-[#2d2d2d] text-center mb-1">Depth (cm)</h3>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 2, right: 10, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" opacity={0.15} vertical={false} />
                      <XAxis dataKey="compressions" stroke="#2d2d2d" tick={{ fontSize: 10, fontFamily: "var(--font-body)" }} tickLine={false} />
                      <YAxis stroke="#2d2d2d" tick={{ fontSize: 10, fontFamily: "var(--font-body)" }} domain={[0, 8]} tickLine={false} />
                      <Tooltip contentStyle={ttStyle} itemStyle={{ color: "#2d5da1" }} labelStyle={{ color: "#2d2d2d", fontSize: 11 }} />
                      <ReferenceArea y1={3} y2={6} fill="#2d5da1" fillOpacity={0.1} />
                      <Line type="monotone" dataKey="depthCm" stroke="#2d5da1" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* BPM graph */}
              <div className="flex flex-col h-full">
                <h3 className="font-heading text-sm text-[#2d2d2d] text-center mb-1">BPM</h3>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 2, right: 10, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" opacity={0.15} vertical={false} />
                      <XAxis dataKey="compressions" stroke="#2d2d2d" tick={{ fontSize: 10, fontFamily: "var(--font-body)" }} tickLine={false} />
                      <YAxis stroke="#2d2d2d" tick={{ fontSize: 10, fontFamily: "var(--font-body)" }} domain={[60, 150]} tickLine={false} />
                      <Tooltip contentStyle={ttStyle} itemStyle={{ color: "#ff4d4d" }} labelStyle={{ color: "#2d2d2d", fontSize: 11 }} />
                      <ReferenceArea y1={100} y2={120} fill="#ff4d4d" fillOpacity={0.1} />
                      <Line type="stepAfter" dataKey="bpm" stroke="#ff4d4d" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
