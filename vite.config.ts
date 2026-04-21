import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy third-party deps into their own long-lived chunks so
        // they can be cached between deploys and loaded only on pages that
        // actually need them (charts → Analytics, leaflet → Analytics map,
        // firebase → everywhere but separated from app code).
        manualChunks(id: string) {
          if (id.includes('node_modules/recharts')) return 'recharts';
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) return 'leaflet';
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          return undefined;
        },
      },
    },
  },
})
