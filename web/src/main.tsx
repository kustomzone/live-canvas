import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// We deliberately do NOT wrap in <React.StrictMode>. StrictMode mounts every
// component twice in dev to flush out side-effect bugs, but the symptom
// (every effect firing twice on first paint, e.g. a duplicate
// /api/canvas?limit=24&offset=0) is a constant source of confusion when
// debugging real network behaviour. Production rendering is always single-
// mount; running dev the same way matches what users see.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
);
