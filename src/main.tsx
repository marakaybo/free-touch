import { createRoot } from 'react-dom/client';
import '@fontsource-variable/onest';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/jetbrains-mono';
import '../shared/face.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
