import React, { useState, useEffect } from 'react';

export default function App() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('lz_items');
    if (saved) setItems(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('lz_items', JSON.stringify(items));
  }, [items]);

  function addItem(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setItems(prev => [...prev, { id: Date.now(), name }]);
    setName('');
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div className="container">
      <h1>LZTracker — demo</h1>
      <form onSubmit={addItem} className="form">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nume item..."
        />
        <button type="submit">Adaugă</button>
      </form>

      <ul className="list">
        {items.length === 0 && <li className="muted">Niciun item</li>}
        {items.map(item => (
          <li key={item.id}>
            {item.name}
            <button className="del" onClick={() => removeItem(item.id)}>Șterge</button>
          </li>
        ))}
      </ul>

      <footer className="footer">
        <small>Datele sunt stocate local (localStorage) — exemplu demo.</small>
      </footer>
    </div>
  );
}"Add Vite React frontend and GitHub Pages workflow"
