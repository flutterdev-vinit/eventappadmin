import { useState, useEffect } from 'react';

interface WindowSize {
  width: number;
  isMobile: boolean;   // < 768px
  isTablet: boolean;   // < 1024px
}

export function useWindowSize(): WindowSize {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    let raf: number;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener('resize', handler, { passive: true });
    return () => {
      window.removeEventListener('resize', handler);
      cancelAnimationFrame(raf);
    };
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width < 1024,
  };
}
