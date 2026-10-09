// One cell of a table-like row. On phones every cell is its own line with its label above the
// value; from `sm` up the label hides and the cells become the columns of the row's grid.
export function RowCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:contents">
      <span className="text-xs text-muted-foreground sm:hidden">{label}</span>
      {children}
    </div>
  )
}
