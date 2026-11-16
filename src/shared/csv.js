export function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const escaped = text.replace(/"/g, '""');

  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function buildCsv(columns, rows) {
  const header = columns.map((column) => escapeCsv(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column.key])).join(','));

  return [header, ...body].join('\r\n');
}
