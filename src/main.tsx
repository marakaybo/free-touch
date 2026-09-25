import { createRoot } from 'react-dom/client';
import '../shared/fonts.css';
import '../shared/face.css';
import '../shared/nav.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
