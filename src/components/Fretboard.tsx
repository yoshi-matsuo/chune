"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Note, Interval, Chord } from "@tonaljs/tonal";
import ChordSelector from "./ChordSelector";
import Tuner from "./Tuner";

// ---------- Constants ----------
const OPEN_STRINGS = ["E4", "B3", "G3", "D3", "A2", "E2"]; // string 1 (top) → 6 (bottom)
const FRET_COUNT = 12;
const POSITION_MARKERS = [3, 5, 7, 9];
const DOUBLE_MARKER = 12;
const STRING_THICKNESS = [1, 1.5, 2, 2.5, 3, 3.5];

/** Get the note name for a given string index & fret number */
function getNoteAt(stringIndex: number, fret: number): string {
  const open = OPEN_STRINGS[stringIndex];
  return Note.transpose(open, Interval.fromSemitones(fret)) ?? open;
}

// ---------- Types ----------
interface SavedChord {
  id: number;
  name: string;
  frets: (number | null)[];
}

// ---------- Component ----------
export default function Fretboard() {
  const [selected, setSelected] = useState<(number | null)[]>(
    Array(6).fill(null)
  );
  const [audioState, setAudioState] = useState<"idle" | "loading" | "ready">("idle");
  const [savedChords, setSavedChords] = useState<SavedChord[]>([]);
  const [nextId, setNextId] = useState(1);
  const [strumming, setStrumming] = useState(false);
  const [dictChordName, setDictChordName] = useState<string | null>(null);
  const [tunerOpen, setTunerOpen] = useState(false);
  const samplerRef = useRef<import("tone").Sampler | null>(null);
  const toneModuleRef = useRef<typeof import("tone") | null>(null);

  // --- Chord detection ---
  const detectedChords = useMemo(() => {
    const pitchClasses = selected
      .map((fret, si) => (fret !== null ? Note.pitchClass(getNoteAt(si, fret)) : null))
      .filter((n): n is string => n !== null);
    if (pitchClasses.length < 2) return [];
    return Chord.detect(pitchClasses);
  }, [selected]);

  const mainChord = detectedChords[0] ?? null;
  const altChords = detectedChords.slice(1);

  // --- Audio (Sampler with real guitar samples) ---
  const SAMPLE_BASE_URL =
    "https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/guitar-acoustic/";

  const pendingStrumRef = useRef<(number | null)[] | null>(null);

  const initAudio = useCallback(async () => {
    if (audioState !== "idle") return;
    setAudioState("loading");
    const Tone = await import("tone");
    toneModuleRef.current = Tone;
    await Tone.start();
    samplerRef.current = new Tone.Sampler({
      urls: {
        E2: "E2.mp3",
        A2: "A2.mp3",
        D3: "D3.mp3",
        G3: "G3.mp3",
        C4: "C4.mp3",
        F2: "F2.mp3",
      },
      baseUrl: SAMPLE_BASE_URL,
      release: 1.0,
      onload: () => {
        setAudioState("ready");
        // Play pending strum if queued before audio was ready
        const pending = pendingStrumRef.current;
        if (pending) {
          pendingStrumRef.current = null;
          const strumNotes: string[] = [];
          for (let si = 5; si >= 0; si--) {
            const f = pending[si];
            if (f !== null) strumNotes.push(getNoteAt(si, f));
          }
          if (strumNotes.length > 0) {
            const now = Tone.now();
            const STRUM_DELAY = 0.05;
            strumNotes.forEach((note, i) => {
              samplerRef.current!.triggerAttackRelease(note, "2n", now + i * STRUM_DELAY);
            });
          }
        }
      },
    }).toDestination();
    samplerRef.current.volume.value = -3;
  }, [audioState]);

  useEffect(() => {
    return () => { samplerRef.current?.dispose(); };
  }, []);

  const audioReady = audioState === "ready";

  const playNote = useCallback((note: string) => {
    samplerRef.current?.triggerAttackRelease(note, "8n");
  }, []);

  const playChord = useCallback((frets: (number | null)[]) => {
    if (!samplerRef.current) return;
    const notes = frets
      .map((f, si) => (f !== null ? getNoteAt(si, f) : null))
      .filter((n): n is string => n !== null);
    if (notes.length > 0) {
      samplerRef.current.triggerAttackRelease(notes, "4n");
    }
  }, []);

  /** Strum: play notes low→high with 50ms delay each */
  const playStrum = useCallback((frets: (number | null)[]) => {
    if (!samplerRef.current || !toneModuleRef.current) return;
    const strumNotes: string[] = [];
    for (let si = 5; si >= 0; si--) {
      const f = frets[si];
      if (f !== null) strumNotes.push(getNoteAt(si, f));
    }
    if (strumNotes.length === 0) return;

    setStrumming(true);
    const now = toneModuleRef.current.now();
    const STRUM_DELAY = 0.05;
    strumNotes.forEach((note, i) => {
      samplerRef.current!.triggerAttackRelease(note, "2n", now + i * STRUM_DELAY);
    });
    const totalDuration = (strumNotes.length - 1) * STRUM_DELAY + 0.3;
    setTimeout(() => setStrumming(false), totalDuration * 1000);
  }, []);

  // --- Fret interaction ---
  const handleFretClick = useCallback(
    (stringIndex: number, fret: number) => {
      setDictChordName(null); // clear dictionary selection on manual edit
      setSelected((prev) => {
        const next = [...prev];
        if (next[stringIndex] === fret) {
          next[stringIndex] = null;
        } else {
          next[stringIndex] = fret;
          playNote(getNoteAt(stringIndex, fret));
        }
        return next;
      });
    },
    [playNote]
  );

  // --- Chord dictionary selection ---
  const handleDictSelect = useCallback(
    (frets: (number | null)[], chordName: string) => {
      setDictChordName(chordName);
      setSelected(frets);
      playStrum(frets);
    },
    [playStrum]
  );

  // --- Chord save / load / delete ---
  const handleSave = useCallback(() => {
    const hasNotes = selected.some((f) => f !== null);
    if (!hasNotes) return;
    const name = dictChordName ?? mainChord ?? "Unknown";
    setSavedChords((prev) => [...prev, { id: nextId, name, frets: [...selected] }]);
    setNextId((id) => id + 1);
  }, [selected, mainChord, nextId]);

  const handleLoad = useCallback(
    (chord: SavedChord) => {
      setSelected(chord.frets);
      playStrum(chord.frets);
    },
    [playStrum]
  );

  const handleDelete = useCallback((id: number) => {
    setSavedChords((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // --- Play strum with auto-init: queue if audio not ready ---
  const handlePlayStrum = useCallback(
    (frets: (number | null)[]) => {
      if (audioState === "idle") {
        pendingStrumRef.current = frets;
        initAudio();
      } else if (audioState === "ready") {
        playStrum(frets);
      }
    },
    [audioState, initAudio, playStrum]
  );

  // --- Auto-init audio on first user interaction ---
  const handleFirstInteraction = useCallback(() => {
    if (audioState === "idle") {
      initAudio();
    }
  }, [audioState, initAudio]);

  // ---------- Render ----------
  return (
    <div
      className="flex flex-col items-center gap-3 w-full max-w-5xl"
      onClickCapture={handleFirstInteraction}
    >
      {/* Chord display */}
      <div className="w-full flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          {audioState === "loading" && (
            <p className="text-sm text-amber-400 animate-pulse font-medium">
              Loading sounds...
            </p>
          )}
          {audioState === "ready" && (
            <button
              onClick={() => setTunerOpen(true)}
              className="px-4 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Tuner
            </button>
          )}
        </div>

        {/* Chord Dictionary */}
        <ChordSelector onSelect={handleDictSelect} />

        {/* Main chord name */}
        <div className="text-4xl md:text-6xl font-black tracking-tight text-white drop-shadow-lg text-center">
          {dictChordName ?? mainChord ?? (selected.some((f) => f !== null) ? "Unknown" : "Select notes...")}
        </div>

        {/* Action buttons – always side by side */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handlePlayStrum(selected)}
            disabled={audioState === "loading" || !selected.some((f) => f !== null)}
            className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all cursor-pointer disabled:cursor-not-allowed shadow-md whitespace-nowrap ${
              strumming
                ? "bg-emerald-400 text-emerald-950 scale-105"
                : "bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white"
            }`}
          >
            {strumming ? "Playing..." : "Play Chord"}
          </button>
          <button
            onClick={handleSave}
            disabled={!selected.some((f) => f !== null)}
            className="px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold text-sm transition-colors cursor-pointer disabled:cursor-not-allowed shadow-md whitespace-nowrap"
          >
            Save Chord
          </button>
        </div>

        {/* Alt chord names */}
        {altChords.length > 0 && (
          <div className="flex gap-2 flex-wrap justify-center">
            {altChords.map((name, i) => (
              <span
                key={i}
                className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-mono border border-zinc-700"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Fretboard */}
      <div className="overflow-x-auto w-full px-2">
        <div
          className="relative rounded-lg border border-amber-900/60 shadow-2xl min-w-[720px]"
          style={{
            background:
              "linear-gradient(180deg, #3e2723 0%, #4e342e 40%, #5d4037 100%)",
          }}
        >
          {/* Fret numbers header */}
          <div className="flex">
            <div className="w-12 shrink-0 text-center text-[11px] text-amber-200/70 py-1 font-mono">
              0
            </div>
            {Array.from({ length: FRET_COUNT }, (_, f) => (
              <div
                key={f}
                className="flex-1 text-center text-[11px] text-amber-200/70 py-1 font-mono"
              >
                {f + 1}
              </div>
            ))}
          </div>

          {/* Strings area */}
          <div className="relative">
            {OPEN_STRINGS.map((open, si) => (
              <div key={si} className="flex items-center">
                {/* Nut (fret 0) */}
                <button
                  onClick={() => handleFretClick(si, 0)}
                  className="w-12 shrink-0 h-10 flex items-center justify-center relative cursor-pointer group"
                  aria-label={`String ${si + 1} open ${open}`}
                >
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-gray-100 to-gray-300 shadow-md" />
                  <div
                    className="absolute left-0 right-1.5 top-1/2 -translate-y-1/2 bg-amber-100/70"
                    style={{ height: STRING_THICKNESS[si] }}
                  />
                  {selected[si] === 0 ? (
                    <div className="relative z-10 w-7 h-7 rounded-full bg-sky-500 shadow-lg shadow-sky-500/50 flex items-center justify-center text-[10px] font-bold text-white">
                      {Note.pitchClass(open)}
                    </div>
                  ) : (
                    <span className="relative z-10 text-[10px] text-amber-200/60 font-mono group-hover:text-amber-100 transition-colors">
                      {Note.pitchClass(open)}
                    </span>
                  )}
                </button>

                {/* Frets 1-12 */}
                {Array.from({ length: FRET_COUNT }, (_, f) => {
                  const fret = f + 1;
                  const isSelected = selected[si] === fret;
                  const note = getNoteAt(si, fret);

                  return (
                    <button
                      key={fret}
                      onClick={() => handleFretClick(si, fret)}
                      className="flex-1 h-10 relative cursor-pointer group"
                      aria-label={`String ${si + 1} fret ${fret} ${note}`}
                    >
                      <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-gray-300 via-gray-200 to-gray-300 shadow-sm" />
                      <div
                        className="absolute left-0 right-0 top-1/2 -translate-y-1/2 bg-amber-100/70"
                        style={{ height: STRING_THICKNESS[si] }}
                      />
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <div className="w-7 h-7 rounded-full bg-sky-500 shadow-lg shadow-sky-500/50 flex items-center justify-center text-[10px] font-bold text-white">
                            {Note.pitchClass(note)}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {/* Position markers */}
            <div className="absolute inset-0 pointer-events-none flex">
              <div className="w-12 shrink-0" />
              {Array.from({ length: FRET_COUNT }, (_, f) => {
                const fret = f + 1;
                const isSingle = POSITION_MARKERS.includes(fret);
                const isDouble = fret === DOUBLE_MARKER;
                return (
                  <div key={fret} className="flex-1 relative">
                    {isSingle && (
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-200/30" />
                    )}
                    {isDouble && (
                      <>
                        <div className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-amber-200/30" style={{ top: "25%" }} />
                        <div className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-amber-200/30" style={{ top: "75%" }} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="h-2" />
        </div>
      </div>

      {/* Selected notes display */}
      <div className="flex gap-3 text-sm font-mono">
        {OPEN_STRINGS.map((_, si) => {
          const fret = selected[si];
          const label =
            fret !== null ? Note.pitchClass(getNoteAt(si, fret)) : "x";
          return (
            <div
              key={si}
              className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base ${
                fret !== null
                  ? "bg-sky-500/20 text-sky-400 border border-sky-500/40"
                  : "bg-zinc-800 text-zinc-500 border border-zinc-700"
              }`}
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* Tuner Modal */}
      {tunerOpen && (
        <Tuner samplerRef={samplerRef} onClose={() => setTunerOpen(false)} />
      )}

      {/* Saved Chords */}
      {savedChords.length > 0 && (
        <div className="w-full">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wider">
            Saved Chords
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {savedChords.map((chord) => (
              <div
                key={chord.id}
                className="group relative rounded-xl border border-zinc-700/80 bg-zinc-800/60 hover:bg-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer overflow-hidden"
                onClick={() => handleLoad(chord)}
              >
                <div className="px-4 py-3">
                  <p className="text-lg font-bold text-white truncate">
                    {chord.name}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono mt-1">
                    {chord.frets.map((f) => (f !== null ? f : "x")).join(" - ")}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(chord.id);
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  aria-label="Delete chord"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
