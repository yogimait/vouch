// A template, not a layout: Next remounts it on every navigation, which is what replays the enter
// animation. The dock lives in the layout so it stays still while the page under it changes.
export default function ConsoleTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
