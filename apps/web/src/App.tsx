import { Link, Route, Routes } from 'react-router-dom';
import { DocumentPage } from './pages/DocumentPage';
import { HomePage } from './pages/HomePage';

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-brand" style={{ textDecoration: 'none' }}>
          <span className="app-brand__title">LedgerLens</span>
          <span className="app-brand__sub">CSV → insights</span>
        </Link>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/documents/:id" element={<DocumentPage />} />
        </Routes>
      </main>
    </div>
  );
}
