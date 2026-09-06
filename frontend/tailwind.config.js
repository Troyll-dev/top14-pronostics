/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        rugby: {
          green: '#1B5E20',
          gold: '#F59E0B',
          dark: '#0F172A',
        },
      },
    },
  },
  plugins: [],
};
