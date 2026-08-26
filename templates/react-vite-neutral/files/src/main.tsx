import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RecipeRuntime } from './generated/recipes';
import './design/tokens.css';
import './generated/brand.css';
import './styles.css';

// Any bespoke presentation this project carries, loaded last so it can answer
// the one section the Presentation Registry could not. The glob is the whole
// integration: the template loads whatever is in the directory, so a fulfilment
// writes its own file and never edits a shared one. A project with none — which
// is almost every project — resolves to nothing and costs nothing.
import.meta.glob('./presentation/bespoke/*.css', { eager: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecipeRuntime>
      <App />
    </RecipeRuntime>
  </StrictMode>,
);
