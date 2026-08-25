import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const principles = [
  'Requirements first',
  'Deterministic before generative',
  'Modules instead of repeated code',
  'Small context and cost budgets',
  'Portable repositories with no lock-in',
];

function App() {
  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Foundation v0</p>
        <h1>App Builder</h1>
        <p className="lede">
          A private AI-first website and application factory designed to turn a reviewed build contract into a tested, portable product with minimal repeated AI work.
        </p>
      </header>
      <section className="status" aria-labelledby="foundation-status">
        <div>
          <p className="eyebrow">Current stage</p>
          <h2 id="foundation-status">Build the factory before the builder UI</h2>
          <p>
            Intake contracts, module boundaries, deterministic generation and quality rules come first. Live preview, chat, assets and visual editing are later console layers over the same engine.
          </p>
        </div>
        <ol>
          {principles.map((principle) => <li key={principle}>{principle}</li>)}
        </ol>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
