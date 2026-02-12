"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// ==================== Shared Constants ====================
const STRINGS = [
  { label: "6th", note: "E2", display: "E2" },
  { label: "5th", note: "A2", display: "A2" },
  { label: "4th", note: "D3", display: "D3" },
  { label: "3rd", note: "G3", display: "G3" },
  { label: "2nd", note: "B3", display: "B3" },
  { label: "1st", note: "E4", display: "E4" },
];

const LOOP_INTERVAL = 2500;

// All 12 note names for frequency → note conversion
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const A4_FREQ = 440;

interface TunerProps {
  samplerRef: React.RefObject<import("tone").Sampler | null>;
  onClose: () => void;
}

// ==================== Pitch Utilities ====================

/** Convert frequency to { note, octave, cents } */
function freqToNote(freq: number): { note: string; octave: number; cents: number; noteWithOctave: string } {
  const semitones = 12 * Math.log2(freq / A4_FREQ);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  // A4 = MIDI 69, so noteIndex relative to C
  const midi = 69 + rounded;
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[noteIndex];
  return { note, octave, cents, noteWithOctave: `${note}${octave}` };
}

/** YIN autocorrelation pitch detection */
function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length;
  // Check if there's enough signal
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null; // too quiet

  // YIN-style difference function
  const yinBuffer = new Float32Array(SIZE / 2);
  yinBuffer[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau < SIZE / 2; tau++) {
    let diff = 0;
    for (let i = 0; i < SIZE / 2; i++) {
      const delta = buf[i] - buf[i + tau];
      diff += delta * delta;
    }
    runningSum += diff;
    yinBuffer[tau] = diff * tau / runningSum;
  }

  // Find the first dip below threshold
  const threshold = 0.15;
  let tau = 2;
  while (tau < SIZE / 2) {
    if (yinBuffer[tau] < threshold) {
      while (tau + 1 < SIZE / 2 && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
      break;
    }
    tau++;
  }
  if (tau === SIZE / 2) return null;

  // Parabolic interpolation for sub-sample accuracy
  const s0 = yinBuffer[tau - 1];
  const s1 = yinBuffer[tau];
  const s2 = yinBuffer[tau + 1];
  const betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));

  const freq = sampleRate / betterTau;
  // Guitar range: ~70Hz (E2) to ~1400Hz (high frets)
  if (freq < 60 || freq > 1500) return null;
  return freq;
}

// ==================== Ear Mode ====================
function EarMode({ samplerRef }: { samplerRef: React.RefObject<import("tone").Sampler | null> }) {
  const [activeString, setActiveString] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pulse, setPulse] = useState(false);

  const stopLoop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setActiveString(null);
    setPulse(false);
  }, []);

  const startLoop = useCallback(
    (index: number) => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (activeString === index) {
        setActiveString(null);
        setPulse(false);
        return;
      }
      const note = STRINGS[index].note;
      setActiveString(index);
      samplerRef.current?.triggerAttackRelease(note, "1n");
      setPulse(true);
      setTimeout(() => setPulse(false), 400);
      intervalRef.current = setInterval(() => {
        samplerRef.current?.triggerAttackRelease(note, "1n");
        setPulse(true);
        setTimeout(() => setPulse(false), 400);
      }, LOOP_INTERVAL);
    },
    [activeString, samplerRef]
  );

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <>
      <p className="text-xs text-zinc-500 mb-4 text-center">
        Tap a string to hear its pitch on repeat.
      </p>
      <div className="flex flex-col gap-2.5">
        {STRINGS.map((s, i) => {
          const isActive = activeString === i;
          return (
            <button
              key={i}
              onClick={() => startLoop(i)}
              className={`relative overflow-hidden rounded-xl px-5 py-3.5 font-bold text-lg transition-all cursor-pointer ${
                isActive
                  ? "bg-amber-500 text-zinc-900 shadow-lg shadow-amber-500/30 scale-[1.02]"
                  : "bg-zinc-800 text-white hover:bg-zinc-700"
              }`}
            >
              {isActive && pulse && (
                <span className="absolute inset-0 rounded-xl animate-ping bg-amber-400/30 pointer-events-none" />
              )}
              <span className="relative flex items-center justify-between">
                <span className="text-sm opacity-70">{s.label} String</span>
                <span className="text-xl tracking-wider">{s.display}</span>
                {isActive && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={stopLoop}
        disabled={activeString === null}
        className="mt-4 w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        Stop
      </button>
    </>
  );
}

// ==================== Meter Mode ====================
const SMOOTHING_SIZE = 8; // rolling average window

function MeterMode() {
  const [micState, setMicState] = useState<"idle" | "starting" | "active">("idle");
  const [frequency, setFrequency] = useState<number | null>(null);
  const [noteInfo, setNoteInfo] = useState<{ note: string; octave: number; cents: number; noteWithOctave: string } | null>(null);
  const [smoothedCents, setSmoothedCents] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const centsHistoryRef = useRef<number[]>([]);

  const startMic = useCallback(async () => {
    setMicState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      analyserRef.current = analyser;

      bufferRef.current = new Float32Array(analyser.fftSize);
      centsHistoryRef.current = [];
      setMicState("active");

      const detect = () => {
        if (!analyserRef.current || !bufferRef.current) return;
        analyserRef.current.getFloatTimeDomainData(bufferRef.current);
        const freq = detectPitch(bufferRef.current, audioCtx.sampleRate);
        setFrequency(freq);
        if (freq) {
          const info = freqToNote(freq);
          setNoteInfo(info);
          // Push to rolling buffer and compute average
          const history = centsHistoryRef.current;
          history.push(info.cents);
          if (history.length > SMOOTHING_SIZE) history.shift();
          const avg = history.reduce((a, b) => a + b, 0) / history.length;
          setSmoothedCents(avg);
        } else {
          setNoteInfo(null);
        }
        rafRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch {
      setMicState("idle");
    }
  }, []);

  const stopMic = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    rafRef.current = null;
    bufferRef.current = null;
    centsHistoryRef.current = [];
    setMicState("idle");
    setFrequency(null);
    setNoteInfo(null);
    setSmoothedCents(0);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  const displayCents = noteInfo ? Math.round(smoothedCents) : 0;
  const needleAngle = Math.max(-50, Math.min(50, smoothedCents)) * 1.8;
  const inTune = noteInfo !== null && Math.abs(displayCents) <= 5;
  const close = noteInfo !== null && Math.abs(displayCents) <= 15;
  const needleColor = noteInfo === null ? "#3f3f46" : inTune ? "#22c55e" : close ? "#eab308" : "#ef4444";

  // Fixed-height container for idle / starting states to prevent layout shift
  if (micState !== "active") {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: 340 }}>
        {micState === "idle" ? (
          <>
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-zinc-400">
                <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
              </svg>
            </div>
            <p className="text-sm text-zinc-400 text-center mb-4">
              Enable the microphone to detect your guitar&apos;s pitch.
            </p>
            <button
              onClick={startMic}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer shadow-md"
            >
              Enable Microphone
            </button>
          </>
        ) : (
          <p className="text-sm text-amber-400 animate-pulse">Starting microphone...</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center" style={{ minHeight: 340 }}>
      {/* Meter - fixed size */}
      <div className="w-64 h-36 shrink-0">
        <svg viewBox="0 0 200 110" className="w-full h-full" style={{ willChange: "transform" }}>
          {/* Outer arc */}
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#27272a" strokeWidth="8" strokeLinecap="round" />
          {/* Red left */}
          <path d="M 10 100 A 90 90 0 0 1 40 30" fill="none" stroke="#ef4444" strokeWidth="6" strokeLinecap="round" opacity="0.4" />
          {/* Yellow left */}
          <path d="M 40 30 A 90 90 0 0 1 70 12" fill="none" stroke="#eab308" strokeWidth="6" strokeLinecap="round" opacity="0.4" />
          {/* Green center */}
          <path d="M 70 12 A 90 90 0 0 1 130 12" fill="none" stroke="#22c55e" strokeWidth="6" strokeLinecap="round" opacity="0.6" />
          {/* Yellow right */}
          <path d="M 130 12 A 90 90 0 0 1 160 30" fill="none" stroke="#eab308" strokeWidth="6" strokeLinecap="round" opacity="0.4" />
          {/* Red right */}
          <path d="M 160 30 A 90 90 0 0 1 190 100" fill="none" stroke="#ef4444" strokeWidth="6" strokeLinecap="round" opacity="0.4" />

          {/* Tick marks */}
          {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((c) => {
            const angle = (c * 1.8 - 90) * (Math.PI / 180);
            const x1 = 100 + 78 * Math.cos(angle);
            const y1 = 100 + 78 * Math.sin(angle);
            const len = c === 0 ? 68 : 72;
            const x2 = 100 + len * Math.cos(angle);
            const y2 = 100 + len * Math.sin(angle);
            return (
              <line key={c} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={c === 0 ? "#22c55e" : "#52525b"} strokeWidth={c === 0 ? 2.5 : 1.5} />
            );
          })}

          <text x="22" y="95" fill="#71717a" fontSize="10" textAnchor="middle">-50</text>
          <text x="100" y="10" fill="#22c55e" fontSize="10" textAnchor="middle" fontWeight="bold">0</text>
          <text x="178" y="95" fill="#71717a" fontSize="10" textAnchor="middle">+50</text>

          {/* Needle - always rendered, GPU-accelerated transform */}
          <g style={{
            transform: `rotate(${needleAngle}deg)`,
            transformOrigin: "100px 100px",
            transition: "transform 0.2s cubic-bezier(0.33, 1, 0.68, 1)",
            willChange: "transform",
          }}>
            <line x1="100" y1="100" x2="100" y2="18"
              stroke={needleColor} strokeWidth="2.5" strokeLinecap="round"
              style={{ transition: "stroke 0.3s" }} />
          </g>

          {/* Center pivot */}
          <circle cx="100" cy="100" r="5" fill={inTune ? "#22c55e" : "#3f3f46"} style={{ transition: "fill 0.3s" }} />
          {inTune && <circle cx="100" cy="100" r="8" fill="none" stroke="#22c55e" strokeWidth="1" opacity="0.5" />}
        </svg>
      </div>

      {/* Note display - fixed size container */}
      <div className="w-full h-28 flex flex-col items-center justify-center shrink-0">
        <p className={`text-5xl font-black transition-colors duration-300 tabular-nums ${inTune ? "text-emerald-400" : "text-white"}`}
           style={{ minWidth: "5ch", textAlign: "center" }}>
          {noteInfo ? noteInfo.noteWithOctave : "---"}
        </p>
        <p className="text-sm text-zinc-500 mt-1 h-5" style={{ fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, monospace" }}>
          {frequency ? (
            <>
              {frequency.toFixed(1).padStart(7)} Hz
              <span className={`ml-2 ${inTune ? "text-emerald-400" : close ? "text-yellow-400" : "text-red-400"}`}
                    style={{ transition: "color 0.3s" }}>
                {displayCents >= 0 ? "+" : ""}{String(displayCents).padStart(3)} ct
              </span>
            </>
          ) : (
            <span className="text-zinc-600">Listening...</span>
          )}
        </p>
        <div className="h-6 flex items-center">
          {inTune && (
            <span className="text-sm font-semibold text-emerald-400 animate-pulse">In Tune!</span>
          )}
        </div>
      </div>

      {/* Stop button */}
      <button
        onClick={stopMic}
        className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors cursor-pointer shrink-0"
      >
        Stop Microphone
      </button>
    </div>
  );
}

// ==================== Main Tuner ====================
type TunerTab = "ear" | "meter";

export default function Tuner({ samplerRef, onClose }: TunerProps) {
  const [tab, setTab] = useState<TunerTab>("ear");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Tuner</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
            aria-label="Close tuner"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-zinc-800 p-1 mb-5">
          <button
            onClick={() => setTab("ear")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              tab === "ear"
                ? "bg-amber-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Ear Mode
          </button>
          <button
            onClick={() => setTab("meter")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              tab === "meter"
                ? "bg-emerald-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Meter Mode
          </button>
        </div>

        {/* Tab content */}
        {tab === "ear" ? (
          <EarMode samplerRef={samplerRef} />
        ) : (
          <MeterMode />
        )}
      </div>
    </div>
  );
}
