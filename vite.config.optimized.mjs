import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  root: 'src/ui',
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: false
    })
  ],
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split antd into smaller chunks
          'antd-core': ['antd/es/config-provider', 'antd/es/_util', 'antd/es/style'],
          'antd-components': ['antd/es/button', 'antd/es/input', 'antd/es/table', 'antd/es/form'],
          'antd-hooks': ['antd/es/hooks'],
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-icons': ['@ant-design/icons']
        }
      }
    },
    // Enable aggressive minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.info', 'console.debug']
      }
    }
  },
  // Enable CSS optimization
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        modifyVars: {
          'primary-color': '#1890ff',
          'link-color': '#1890ff'
        }
      }
    }
  }
});