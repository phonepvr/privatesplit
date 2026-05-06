import { Header } from '../../app/shell/Header';
import { Button } from '../../ui/components/Button';
import { useGroups } from '../../stores/groups-store';
import { formatMinor } from '../../core/money/format';

interface Props {
  onBack: () => void;
}

export function Trash({ onBack }: Props) {
  const groups = useGroups((s) => s.groups);
  const expensesByGroup = useGroups((s) => s.expensesByGroup);
  const restore = useGroups((s) => s.restoreExpense);
  const purge = useGroups((s) => s.permanentlyDeleteExpense);
  const items = groups.flatMap((g) =>
    (expensesByGroup.get(g.id) ?? [])
      .filter((e) => e.deletedAt)
      .map((e) => ({ group: g, expense: e }))
  );
  return (
    <div className="pb-24">
      <Header title="Trash" back={onBack} />
      <div className="mx-auto max-w-md px-4 py-3">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Trash is empty.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map(({ group, expense }) => (
              <li
                key={expense.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{expense.description}</p>
                  <p className="text-xs text-slate-500">
                    {group.name} · {formatMinor(expense.amountMinor, group.currency)}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => void restore(group.id, expense.id)}>
                  Restore
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm('Permanently delete?')) void purge(group.id, expense.id);
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
