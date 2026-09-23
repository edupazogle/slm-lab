import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// A browser fetches a font file the first time a glyph needs it. Left alone, the bold typed face arrives while the
// first answer is streaming — and then the receipt's "network requests" count is 1, for a font, which is a confusing
// way to make an honest point. Pull the faces the chat uses at start-up instead. (Measured: without this, one
// same-origin request for courier-prime-700 landed inside the first answer.)
try {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  void fonts?.load('400 1rem "Courier Prime"');
  void fonts?.load('700 1rem "Courier Prime"');
  void fonts?.load('600 1rem "Archivo Variable"');
  void fonts?.load('800 1rem "Archivo Variable"');
} catch {
  /* the fonts load on demand instead */
}

// StrictMode stays off: it double-invokes effects, and here that means loading a model twice.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
