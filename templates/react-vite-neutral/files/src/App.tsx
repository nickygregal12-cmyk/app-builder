import { useEffect } from 'react';
import { project } from './generated/project';
import { initializeRecipes, installedRecipes } from './generated/recipes';

export default function App() {
  useEffect(() => { initializeRecipes(project); }, []);
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">{project.type.replaceAll('-', ' ')}</p>
        <h1>{project.name}</h1>
        <p className="goal">{project.primaryGoal}</p>
        <div className="status-row"><span>Generated deterministically</span><span>{installedRecipes.length} installed capabilities</span></div>
      </section>
      <section className="capabilities" aria-labelledby="capabilities-title">
        <div><p className="eyebrow">Composition</p><h2 id="capabilities-title">Only selected recipes are installed.</h2></div>
        {installedRecipes.length ? <ul>{installedRecipes.map((recipe) => <li key={recipe.id}><strong>{recipe.label}</strong><span>{recipe.id}</span></li>)}</ul> : <p className="empty">No optional recipes are installed in this project.</p>}
      </section>
    </main>
  );
}
