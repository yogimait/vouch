// A template, not a layout: Next remounts it on every navigation, which is what replays the enter
// animation. It also carries the flex column, so a page can hand one child the remaining height.
export default function ConsoleTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col lg:min-h-0">{children}</div>;
}
