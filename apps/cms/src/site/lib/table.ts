/** A column is numeric when every non-empty body cell is a number (currency signs, 円, separators and % allowed; full-width digits count). */
const NUMBER = /^[¥￥$€£+\-−(]*\s*[\d０-９][\d０-９.,，\s]*(?:%|％|円)?\)?$/;

export interface TableCell {
  text: string;
  header: boolean;
}

export function numericColumns(grid: TableCell[][]): boolean[] {
  const width = Math.max(0, ...grid.map((r) => r.length));
  return Array.from({ length: width }, (_, c) => {
    const body = grid
      .filter((r) => !r[c]?.header)
      .map((r) => r[c]?.text ?? '')
      .filter(Boolean);
    return body.length > 0 && body.every((t) => NUMBER.test(t));
  });
}
