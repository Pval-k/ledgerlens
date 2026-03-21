import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  completeUpload,
  createUploadSession,
  deleteDocument,
  listDocuments,
  putUpload,
  type DocumentRow,
} from '../api/client';

export function HomePage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setDocs(await listDocuments());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load documents');
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onFile(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const session = await createUploadSession({
        originalFilename: file.name,
        contentType: file.type || 'text/csv',
        sizeBytes: file.size,
      });
      await putUpload(session.uploadUrl, file, session.headers);
      await completeUpload(session.documentId);
      await refresh();
      navigate(`/documents/${session.documentId}`, {
        state: { filename: file.name },
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteDoc(doc: DocumentRow) {
    if (
      !window.confirm(
        `Delete “${doc.originalFilename}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    setLoadError(null);
    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2 className="card__title">Upload CSV</h2>
        <p className="muted" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
          Presigned upload to storage, then ingestion runs in the worker. You’ll land
          on the document when processing finishes.
        </p>
        <label className="dropzone" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={uploading}
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              ev.target.value = '';
              if (f) void onFile(f);
            }}
          />
          {uploading ? (
            <span>Uploading…</span>
          ) : (
            <>
              <strong>Choose a CSV</strong>
              <div className="muted" style={{ marginTop: '0.35rem' }}>
                or drag & drop (browser: click to pick a file)
              </div>
            </>
          )}
        </label>
        {uploadError ? (
          <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
            {uploadError}
          </div>
        ) : null}
      </div>

      <div className="card">
        <div
          className="row"
          style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}
        >
          <h2 className="card__title" style={{ margin: 0 }}>
            Documents
          </h2>
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {loadError ? (
          <div className="alert alert-error">{loadError}</div>
        ) : docs === null ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : docs.length === 0 ? (
          <p className="empty-hint">No documents yet. Upload a CSV above.</p>
        ) : (
          <ul className="doc-list">
            {docs.map((d) => (
              <li key={d.id}>
                <div className="doc-list__row">
                  <Link className="doc-list__link" to={`/documents/${d.id}`}>
                    <span className="doc-list__name">{d.originalFilename}</span>
                    <span className="badge badge-neutral">{d.status}</span>
                  </Link>
                  <button
                    type="button"
                    className="btn btn-danger-ghost"
                    disabled={deletingId === d.id}
                    onClick={() => void onDeleteDoc(d)}
                  >
                    {deletingId === d.id ? '…' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
