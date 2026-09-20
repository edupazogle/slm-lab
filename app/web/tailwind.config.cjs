/** @type {import('tailwindcss').Config} */
// Identity: the carbonless duplicate claim form. Carbon-blue ink on form stock, one canary-yellow copy.
// daisyUI semantic colours are mapped to it so the vendored wllama components inherit the look unchanged.
export default {
  content: ['./index.html', './chat.html', './bench.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Archivo Variable"', 'Archivo', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        typed: ['"Courier Prime"', '"Courier New"', 'ui-monospace', 'monospace'],
      },
      colors: { ink: '#0E1230', carbon: '#1B2A6B', field: '#DCE6F7', paper: '#F7F9FC', canary: '#FFE45C', stamp: '#C8372D' },
      borderRadius: { form: '2px' },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    logs: false,
    themes: [
      { carbon: {
          primary: '#1B2A6B', 'primary-content': '#F7F9FC', secondary: '#3D5BC9', 'secondary-content': '#F7F9FC',
          accent: '#FFE45C', 'accent-content': '#0E1230', neutral: '#0E1230', 'neutral-content': '#F7F9FC',
          'base-100': '#FFFFFF', 'base-200': '#F7F9FC', 'base-300': '#E9EEF8', 'base-content': '#0E1230',
          info: '#3D5BC9', success: '#1F7A4D', warning: '#B7791F', error: '#C8372D',
          '--rounded-box': '2px', '--rounded-btn': '2px', '--rounded-badge': '2px', '--tab-radius': '2px' } },
      { carbonpaper: {
          primary: '#9DB2FF', 'primary-content': '#0A0F2C', secondary: '#C9D6FF', 'secondary-content': '#0A0F2C',
          accent: '#FFE45C', 'accent-content': '#0A0F2C', neutral: '#C9D6FF', 'neutral-content': '#0A0F2C',
          'base-100': '#121A45', 'base-200': '#0C1233', 'base-300': '#080C26', 'base-content': '#DCE4FF',
          info: '#9DB2FF', success: '#5FD39A', warning: '#F2C261', error: '#FF8A7E',
          '--rounded-box': '2px', '--rounded-btn': '2px', '--rounded-badge': '2px', '--tab-radius': '2px' } },
    ],
    darkTheme: 'carbonpaper',
  },
};
