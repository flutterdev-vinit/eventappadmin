import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Images, X, Upload } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/Table';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadImage,
  type CategoryInput,
} from '../lib/firestore';
import type { EventCategory } from '../types';

export default function Categories() {
  const navigate = useNavigate();
  const [items, setItems] = useState<EventCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventCategory | 'new' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listCategories();
        if (!cancelled) setItems(rows);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const handleDelete = async (cat: EventCategory) => {
    const ok = window.confirm(`Delete category "${cat.name ?? cat.id}"? Events referencing it will block the delete.`);
    if (!ok) return;
    try {
      await deleteCategory(cat.id, { name: cat.name ?? null });
      reload();
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  const columns = [
    {
      key: 'image',
      header: '',
      width: '72px',
      render: (c: EventCategory) =>
        c.image_path ? (
          <img src={c.image_path} alt="" style={styles.thumb} />
        ) : (
          <div style={{ ...styles.thumb, background: '#f3f4f6' }} />
        ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (c: EventCategory) => (
        <strong style={{ color: '#111827' }}>{c.name ?? '—'}</strong>
      ),
    },
    {
      key: 'id',
      header: 'ID',
      render: (c: EventCategory) => (
        <code style={{ fontSize: 12, color: '#6b7280' }}>{c.id}</code>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (c: EventCategory) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            style={styles.iconBtn}
            title="Gallery"
            onClick={() => navigate(`/categories/${c.id}/gallery`)}
          >
            <Images size={14} />
          </button>
          <button
            style={styles.iconBtn}
            title="Edit"
            onClick={() => setEditing(c)}
          >
            <Pencil size={14} />
          </button>
          <button
            style={{ ...styles.iconBtn, color: '#dc2626' }}
            title="Delete"
            onClick={() => void handleDelete(c)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Categories" subtitle="Manage event categories shown in the mobile app's home feed and filters." />

      <div style={styles.tableCard}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>All categories</h2>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {loading ? 'Loading…' : `${items.length} total`}
            </p>
          </div>
          <button style={styles.primaryBtn} onClick={() => setEditing('new')}>
            <Plus size={16} /> New category
          </button>
        </div>

        {error && <div style={styles.errorBar}>{error}</div>}

        <DataTable
          columns={columns}
          data={items}
          keyField="id"
          loading={loading}
          emptyMessage="No categories yet — create the first one."
        />
      </div>

      {editing && (
        <CategoryModal
          key={editing === 'new' ? '__new__' : editing.id}
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────

interface ModalProps {
  category: EventCategory | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

function CategoryModal({ category, onClose, onSaved }: ModalProps) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.name ?? '');
  const [imageUrl, setImageUrl] = useState(category?.image_path ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (f) setImageUrl(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setErr('Name is required');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      let finalImage = imageUrl;
      if (file) {
        const { url } = await uploadImage(file, 'categories');
        finalImage = url;
      }
      const input: CategoryInput = { name: name.trim(), image_path: finalImage };
      if (isEdit && category) {
        await updateCategory(category.id, input);
      } else {
        await createCategory(input);
      }
      await onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            {isEdit ? 'Edit category' : 'New category'}
          </h2>
          <button style={styles.iconBtn} onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div style={styles.modalBody}>
          <label style={styles.label}>
            Name
            <input
              type="text"
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Music"
              autoFocus
            />
          </label>

          <label style={styles.label}>
            Image
            <div style={styles.imagePicker}>
              {imageUrl ? (
                <img src={imageUrl} alt="" style={styles.preview} />
              ) : (
                <div style={{ ...styles.preview, background: '#f3f4f6' }} />
              )}
              <label style={styles.uploadBtn}>
                <Upload size={14} />
                <span>Choose file</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            <input
              type="text"
              style={{ ...styles.input, marginTop: 6 }}
              value={file ? '' : imageUrl}
              onChange={(e) => { setImageUrl(e.target.value); setFile(null); }}
              placeholder="or paste an image URL"
              disabled={!!file}
            />
          </label>

          {err && <div style={styles.errorBar}>{err}</div>}
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.secondaryBtn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={styles.primaryBtn} onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tableCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '18px 20px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
    flexWrap: 'wrap',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    objectFit: 'cover',
  },
  iconBtn: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '6px 8px',
    cursor: 'pointer',
    color: '#374151',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#3d7a5a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    background: '#fff',
    color: '#374151',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorBar: {
    background: '#fee2e2',
    color: '#b91c1c',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13,
    margin: '10px 0',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(17, 24, 39, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 500,
    padding: 16,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '90vh',
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalBody: {
    padding: '18px 20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  modalFooter: {
    padding: '14px 20px',
    borderTop: '1px solid #f3f4f6',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    color: '#111827',
    outline: 'none',
    fontWeight: 400,
  },
  imagePicker: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  preview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    objectFit: 'cover',
    border: '1px solid #e5e7eb',
  },
  uploadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    cursor: 'pointer',
  },
};
