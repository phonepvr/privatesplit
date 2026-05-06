import { useState } from 'react';
import { Button } from '../../ui/components/Button';
import { Input } from '../../ui/components/Input';
import { Modal } from '../../ui/components/Modal';
import { Avatar } from '../../ui/components/Avatar';
import { useGroups } from '../../stores/groups-store';
import type { MemberCacheRow } from '../../core/storage/db';

interface Props {
  open: boolean;
  groupId: string;
  members: MemberCacheRow[];
  onClose: () => void;
}

export function MembersEditor({ open, groupId, members, onClose }: Props) {
  const addMember = useGroups((s) => s.addMember);
  const updateMember = useGroups((s) => s.updateMember);
  const removeMember = useGroups((s) => s.removeMember);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <Modal open={open} onClose={onClose} title="Members">
      <ul className="mb-4 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Avatar name={m.name} color={m.color} size="sm" />
            {editingId === m.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1"
                />
                <button
                  onClick={async () => {
                    if (editName.trim())
                      await updateMember(groupId, m.id, { name: editName.trim() });
                    setEditingId(null);
                  }}
                  className="text-sm text-sky-600"
                >
                  Save
                </button>
                <button onClick={() => setEditingId(null)} className="text-sm text-slate-500">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span
                  className={`flex-1 text-sm ${m.removedAt ? 'text-slate-400 line-through' : 'text-slate-900'}`}
                >
                  {m.name}
                </span>
                {!m.removedAt && (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(m.id);
                        setEditName(m.name);
                      }}
                      className="text-xs text-sky-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${m.name}? Their historical expenses are kept.`)) {
                          void removeMember(groupId, m.id);
                        }
                      }}
                      className="text-xs text-rose-600"
                    >
                      Remove
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          await addMember(groupId, newName.trim());
          setNewName('');
        }}
      >
        <Input
          placeholder="Add member"
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
