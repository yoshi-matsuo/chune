"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ---------- Types for chords-db JSON ----------
interface ChordPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
}

interface ChordEntry {
  key: string;
  suffix: string;
  positions: ChordPosition[];
}

interface ChordsDB {
  keys: string[];
  suffixes: string[];
  chords: Record<string, ChordEntry[]>;
}

// ---------- Props ----------
interface ChordSelectorProps {
  onSelect: (frets: (number | null)[], chordName: string) => void;
}

const CHORDS_DB_URL =
  "https://raw.githubusercontent.com/tombatossals/chords-db/master/lib/guitar.json";

// Suffix display labels for common types
const SUFFIX_LABELS: Record<string, string> = {
  major: "Major",
  minor: "Minor",
  dim: "dim",
  dim7: "dim7",
  aug: "aug",
  "7": "7",
  maj7: "Maj7",
  m7: "m7",
  m7b5: "m7b5",
  "9": "9",
  maj9: "Maj9",
  m9: "m9",
  sus2: "sus2",
  sus4: "sus4",
  "6": "6",
  m6: "m6",
  "69": "6/9",
  add9: "add9",
  "7b5": "7b5",
  aug7: "aug7",
  "7b9": "7b9",
  "7#9": "7#9",
  "11": "11",
  "13": "13",
  maj13: "Maj13",
  mmaj7: "mMaj7",
  "5": "5 (Power)",
};

/** Convert display key (from db.keys e.g. "C#") to chords object key (e.g. "Csharp") */
function chordsKey(displayKey: string): string {
  return displayKey.replace("#", "sharp");
}

/** Convert DB frets array (6th→1st) + baseFret to our format (1st→6th), with null for mute */
function convertFrets(position: ChordPosition): (number | null)[] {
  const { frets, baseFret } = position;
  // DB: [6th, 5th, 4th, 3rd, 2nd, 1st]
  // Our: [1st, 2nd, 3rd, 4th, 5th, 6th]  (index 0 = string 1 top, index 5 = string 6 bottom)
  return [...frets].reverse().map((f) => {
    if (f === -1) return null;
    if (f === 0) return 0;
    return f + baseFret - 1;
  });
}

// ---------- Component ----------
export default function ChordSelector({ onSelect }: ChordSelectorProps) {
  const [db, setDb] = useState<ChordsDB | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [rootKey, setRootKey] = useState("C");
  const [suffix, setSuffix] = useState("major");
  const cacheRef = useRef<ChordsDB | null>(null);

  // Fetch & cache chord DB
  useEffect(() => {
    if (cacheRef.current) {
      setDb(cacheRef.current);
      return;
    }
    setDbLoading(true);
    fetch(CHORDS_DB_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ChordsDB) => {
        cacheRef.current = data;
        setDb(data);
        setDbError(null);
      })
      .catch((err) => {
        setDbError(err.message);
      })
      .finally(() => setDbLoading(false));
  }, []);

  // Look up and fire onSelect whenever rootKey or suffix changes
  const lookup = useCallback(
    (key: string, suf: string) => {
      if (!db) return;
      const chordList = db.chords[chordsKey(key)];
      if (!chordList) return;
      const entry = chordList.find((c) => c.suffix === suf);
      if (!entry || entry.positions.length === 0) return;
      const frets = convertFrets(entry.positions[0]);
      const displayName = `${key} ${SUFFIX_LABELS[suf] ?? suf}`;
      onSelect(frets, displayName);
    },
    [db, onSelect]
  );

  const handleRootChange = useCallback(
    (key: string) => {
      setRootKey(key);
      lookup(key, suffix);
    },
    [suffix, lookup]
  );

  const handleSuffixChange = useCallback(
    (suf: string) => {
      setSuffix(suf);
      lookup(rootKey, suf);
    },
    [rootKey, lookup]
  );

  if (dbLoading) {
    return (
      <div className="text-sm text-zinc-400 animate-pulse">
        Loading chord database...
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="text-sm text-red-400">
        Failed to load chord database: {dbError}
      </div>
    );
  }

  if (!db) return null;

  const keys = db.keys;
  const suffixes = db.suffixes;

  // Check if current combination exists
  const chordList = db.chords[chordsKey(rootKey)];
  const entryExists = chordList?.some((c) => c.suffix === suffix) ?? false;

  return (
    <div className="flex items-center gap-3 flex-wrap justify-center">
      {/* Root key */}
      <select
        value={rootKey}
        onChange={(e) => handleRootChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-white text-lg font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
      >
        {keys.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>

      {/* Suffix */}
      <select
        value={suffix}
        onChange={(e) => handleSuffixChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-white text-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
      >
        {suffixes.map((s) => (
          <option key={s} value={s}>
            {SUFFIX_LABELS[s] ?? s}
          </option>
        ))}
      </select>

      {!entryExists && (
        <span className="text-xs text-red-400/80">Not found</span>
      )}
    </div>
  );
}
