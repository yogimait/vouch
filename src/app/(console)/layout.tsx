import { Nav } from "./nav";

// 128px of bottom padding so content always clears the floating dock.
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="atmosphere min-h-dvh">
      <div className="mx-auto max-w-[1400px] px-8 pt-12 pb-32">{children}</div>
      <Nav />
    </div>
  );
}
