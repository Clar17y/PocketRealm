import { formatNumber } from '@/lib/format';

interface ConstantsTableRow {
  name: string;
  value: string | number;
  description: string;
}

interface ConstantsTableProps {
  rows: ConstantsTableRow[];
}

export function ConstantsTable({ rows }: ConstantsTableProps) {
  return (
    <table className="wiki-table">
      <thead>
        <tr>
          <th>Constant</th>
          <th>Value</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>
              <code>{row.name}</code>
            </td>
            <td>{typeof row.value === 'number' ? formatNumber(row.value) : row.value}</td>
            <td>{row.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
