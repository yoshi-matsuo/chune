import Fretboard from "@/components/Fretboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center py-12 px-4 gap-8">
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Guitar Fretboard
        </h1>
        <p className="mt-2 text-zinc-400 text-sm">
          Click a fret to play a note. One selection per string.
        </p>
      </div>
      <Fretboard />
    </main>
  );
}
