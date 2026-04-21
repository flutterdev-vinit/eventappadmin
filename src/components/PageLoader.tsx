import type { CSSProperties } from 'react';

// Lightweight Suspense fallback shown while a lazy-loaded route chunk is
// fetched. Matches the shimmer language used elsewhere in the dashboard
// (e.g. chart skeletons) so the perceived loading state stays consistent.
export default function PageLoader() {
  return (
    <div style={styles.wrap} role="status" aria-label="Loading page">
      <div style={styles.skeletonTitle} />
      <div style={styles.skeletonSub} />
      <div style={styles.skeletonBlock} />
      <div style={styles.skeletonBlockShort} />
    </div>
  );
}

const shimmer: CSSProperties = {
  background: 'linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 50%, #e5e7eb 100%)',
  backgroundSize: '200% 100%',
  animation: 'pageLoaderShimmer 1.4s ease-in-out infinite',
  borderRadius: 8,
};

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '12px 0',
  },
  skeletonTitle: { ...shimmer, height: 28, width: 200 },
  skeletonSub: { ...shimmer, height: 14, width: 320, marginBottom: 8 },
  skeletonBlock: { ...shimmer, height: 140, width: '100%' },
  skeletonBlockShort: { ...shimmer, height: 80, width: '70%' },
};

// Inject the shimmer keyframes once per mount (cheap; idempotent selector).
if (typeof document !== 'undefined' && !document.getElementById('page-loader-keyframes')) {
  const style = document.createElement('style');
  style.id = 'page-loader-keyframes';
  style.innerHTML = `@keyframes pageLoaderShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
  document.head.appendChild(style);
}
