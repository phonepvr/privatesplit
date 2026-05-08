import { useState } from 'react';
import { Modal } from '../../ui/components/Modal';
import { Input } from '../../ui/components/Input';
import { Button } from '../../ui/components/Button';
import { addCategory, removeCategory, renameCategory } from '../../core/crdt/operations';

interface Props {
  open: boolean;
  groupId: string;
  categories: string[];
  onClose: () => void;
}

export function CategoriesEditor({ open, groupId, categories, onClose }: Props) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <Modal open={open} onClose={onClose} title="Categories">
      <ul className="mb-4 space-y-2">
        {categories.map((c) => (
          <li key={c} className="flex items-center gap-2">
            {editing === c ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1"
                />
                <button
                  onClick={() => {
                    if (editName.trim() && editName.trim() !== c) {
                      renameCategory(groupId, c, editName.trim());
                    }
                    setEditing(null);
                  }}
                  className="text-sm text-sky-600"
                >
                  Save
                </button>
                <button onClick={() => setEditing(null)} className="text-sm text-slate-500">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{c}</span>
                <button
                  onClick={() => {
                    setEditing(c);
                    setEditName(c);
                  }}
                  className="text-xs text-sky-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Remove "${c}" from this group's categories?`)) {
                      removeCategory(groupId, c);
                    }
                  }}
                  className="text-xs text-rose-600"
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          addCategory(groupId, newName.trim());
          setNewName('');
        }}
      >
        <Input
          placeholder="New category"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={!newName.trim()}>
          Add
        </Button>
      </form>
      <div className="mt-4 text-right">
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
