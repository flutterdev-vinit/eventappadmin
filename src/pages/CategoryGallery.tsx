import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Trash2, Upload } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import {
  listGalleryForCategory,
  addGalleryImage,
  deleteGalleryImage,
  getCategory,
} from '../lib/firestore';
import type { EventCategory, GalleryItem } from '../types';

export default function CategoryGallery() {
  const { id: categoryId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [category, setCategory] = useState<EventCategory | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [cat, rows] = await Promise.all([
          getCategory(categoryId),
          listGalleryForCategory(categoryId),
        ]);
        if (cancelled) return;
        setCategory(cat);
        setItems(rows);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [categoryId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !categoryId) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await addGalleryImage({ categoryId, file });
      }
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: GalleryItem) => {
    const ok = window.confirm('Delete this image? This cannot be undone.');
    if (!ok) return;
    try {
      await deleteGalleryImage(item.id, item.image);
      reload();
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  return (
    <div>
      <Link to="/categories" style={styles.backLink}>
        <ArrowLeft size={14} /> Back to categories
      </Link>
      <PageHeader
        title={category?.name ? `${category.name} gallery` : 'Category gallery'}
        subtitle="Images shown on the mobile app's category detail screen."
      />

      <div style={styles.toolbar}>
        <label style={styles.primaryBtn}>
          <Upload size={16} />
          <span>{uploading ? 'Uploading…' : 'Upload images'}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={(e) => void handleUpload(e.target.files)}
            style={{ display: 'none' }}
          />
        </label>
        <button style={styles.secondaryBtn} onClick={() => navigate('/categories')}>
          Done
        </button>
      </div>

      {error && <div style={styles.errorBar}>{error}</div>}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ fontSize: 14, color: '#6b7280' }}>No images yet. Upload one above.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {items.map((item) => (
            <div key={item.id} style={styles.tile}>
              {item.image && (
                <img src={item.image} alt="" style={styles.tileImg} loading="lazy" />
              )}
              <button
                style={styles.deleteBtn}
                title="Delete image"
                onClick={() => void handleDelete(item)}
              >
                <Trash2 size={14} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    color: '#6b7280',
    textDecoration: 'none',
    fontSize: 13,
    marginBottom: 8,
  },
  toolbar: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
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
    marginBottom: 12,
  },
  empty: {
    border: '1px dashed #e5e7eb',
    borderRadius: 12,
    padding: 40,
    textAlign: 'center',
    background: '#fff',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
  },
  tile: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    background: '#f3f4f6',
    aspectRatio: '1 / 1',
    border: '1px solid #e5e7eb',
  },
  tileImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(17, 24, 39, 0.75)',
    border: 'none',
    borderRadius: 8,
    padding: 6,
    cursor: 'pointer',
    display: 'flex',
  },
};
