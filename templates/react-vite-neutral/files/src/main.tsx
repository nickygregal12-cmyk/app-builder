import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RecipeRuntime } from './generated/recipes';
import './design/tokens.css';
import './generated/brand.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecipeRuntime>
      <App />
    </RecipeRuntime>
  </StrictMode>,
);
