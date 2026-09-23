import { Children, Fragment, cloneElement, isValidElement, type CSSProperties, type ReactNode } from "react";

type ElementProps = { children?: ReactNode; role?: string; className?: string };
const semanticCellContainers = new Set(["div", "span", "strong", "em", "b", "small"]);

function rowsWithSemantics(children: ReactNode): ReactNode {
  return Children.map(children, (row) => {
    if (!isValidElement<ElementProps>(row)) return row;
    if (row.type === Fragment) return rowsWithSemantics(row.props.children);
    const cells = Children.map(row.props.children, (cell) => {
      if (cell == null || typeof cell === "boolean") return null;
      // Preserve action roles: a button or link must remain a button or link
      // inside its cell, rather than being relabelled as a non-interactive cell.
      if (isValidElement<ElementProps>(cell) && typeof cell.type === "string" && semanticCellContainers.has(cell.type)) {
        return cloneElement(cell, { role: "cell" });
      }
      return <span role="cell">{cell}</span>;
    });
    return cloneElement(row, { role: "row" }, cells);
  });
}

/** Grid presentation retains real table navigation and associated column names. */
export function AccessibleDataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="live-table" role="table" tabIndex={0} aria-label={`جدول ${headers.join("، ")}`} aria-colcount={headers.length} style={{ "--live-columns": headers.length } as CSSProperties}>
    <div className="live-table-row live-table-head" role="row">{headers.map((header, index) => <span key={`${header}-${index}`} role="columnheader">{header}</span>)}</div>
    {rowsWithSemantics(children)}
  </div>;
}
