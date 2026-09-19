/** @type {import('tailwindcss').Config} */

// Chaque teinte pointe vers une variable CSS definie dans src/index.css.
// Les deux themes (nuit / creme) n'ont qu'a redefinir ces variables :
// tous les composants existants suivent sans etre modifies.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

// Genere une echelle complete 50 -> 950 a partir d'un prefixe de variable.
const scale = (p) => ({
  50:  v(`${p}-50`),
  100: v(`${p}-100`),
  200: v(`${p}-200`),
  300: v(`${p}-300`),
  400: v(`${p}-400`),
  500: v(`${p}-500`),
  600: v(`${p}-600`),
  700: v(`${p}-700`),
  800: v(`${p}-800`),
  900: v(`${p}-900`),
  950: v(`${p}-950`),
});

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Bitter', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // "white" devient l'encre du theme : en creme elle est sombre, ce qui
        // evite tout texte blanc illisible sur fond clair.
        white: v('--ink'),

        slate: scale('--s'),
        amber: scale('--a'),
        green: scale('--g'),
        blue:  scale('--b'),
        red:   scale('--r'),

        rugby: {
          green: '#1B5E20',
          gold: '#B4863B',
          dark: '#07130C',
        },
      },
    },
  },
  plugins: [],
};
