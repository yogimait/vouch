import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  header: string;
  cell: (row: T, index: number) => ReactNode;
  /** Money and counts read wrong left-aligned; prose reads wrong clamped to one line. */
  align?: "right";
  wrap?: boolean;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty: ReactNode;
  /** Fills its parent and scrolls itself, header pinned. The page then never scrolls. */
  fill?: boolean;
}

/** Four pages were carrying the same thead/tbody markup. The columns are the only real difference. */
export function DataTable<T>({ columns, rows, rowKey, empty, fill }: Props<T>) {
  if (rows.length === 0) return <>{empty}</>;

  return (
    <Table containerClassName={cn(fill && "lg:h-full lg:overflow-auto")}>
      <TableHeader className={cn(fill && "lg:sticky lg:top-0 lg:z-10 lg:bg-background")}>
        <TableRow className="hover:bg-transparent">
          {columns.map((c) => (
            <TableHead key={c.header} className={cn("label h-9 px-3 font-normal", c.align === "right" && "text-right")}>
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={rowKey(row, i)} className="align-top">
            {columns.map((c) => (
              <TableCell
                key={c.header}
                className={cn("px-3 py-2.5", c.align === "right" && "text-right", c.wrap && "whitespace-normal", c.className)}
              >
                {c.cell(row, i)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
