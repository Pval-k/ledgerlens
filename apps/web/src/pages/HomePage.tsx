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

function isLikelyCsv(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return true;
  return file.type === 'text/csv' || file.type === 'application/csv';
}

export function HomePage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
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

  const processFiles = useCallback(
    async (fileList: File[]) => {
      const files = fileList.filter(isLikelyCsv);
      if (files.length === 0) {
        setUploadError('No CSV files in that selection.');
        setUploadSuccessMessage(null);
        return;
      }

      setUploadError(null);
      setUploadSuccessMessage(null);
      setUploading(true);
      setUploadProgress({ current: 0, total: files.length });

      const errors: string[] = [];
      let successCount = 0;
      let singleOk: { documentId: string; filename: string } | null = null;

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]!;
          setUploadProgress({ current: i + 1, total: files.length });
          try {
            const session = await createUploadSession({
              originalFilename: file.name,
              contentType: file.type || 'text/csv',
              sizeBytes: file.size,
            });
            await putUpload(session.uploadUrl, file, session.headers);
            await completeUpload(session.documentId);
            successCount += 1;
            singleOk = { documentId: session.documentId, filename: file.name };
          } catch (e) {
            errors.push(
              `${file.name}: ${e instanceof Error ? e.message : 'Upload failed'}`,
            );
          }
        }

        await refresh();
      } finally {
        setUploadProgress(null);
        setUploading(false);
      }

      const onlyOne = files.length === 1;

      if (onlyOne && successCount === 1 && singleOk) {
        navigate(`/documents/${singleOk.documentId}`, {
          state: { filename: singleOk.filename },
        });
        return;
      }

      if (successCount === files.length) {
        setUploadSuccessMessage(
          files.length === 1
            ? 'Upload complete.'
            : `Uploaded ${successCount} files. Open them in the list below; ingestion runs in the worker for each.`,
        );
      } else if (successCount > 0) {
        setUploadSuccessMessage(
          `${successCount} of ${files.length} uploaded. See errors below.`,
        );
        setUploadError(errors.join('\n'));
      } else {
        setUploadError(errors.join('\n'));
      }
    },
    [navigate, refresh],
  );

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
        <p className="card__lede muted">
          Presigned upload to storage, then ingestion runs in the worker. Select
          one or more CSV files (multi-select or drag several). With a single
          file, you’ll jump to that document when the upload step finishes.
        </p>
        <label
          className="dropzone"
          style={{ cursor: uploading ? 'wait' : 'pointer' }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (uploading) return;
            const dropped = Array.from(e.dataTransfer.files);
            if (dropped.length) void processFiles(dropped);
          }}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            disabled={uploading}
            onChange={(ev) => {
              // Snapshot before clearing: resetting value empties the live FileList in browsers.
              const files = ev.target.files?.length
                ? Array.from(ev.target.files)
                : [];
              ev.target.value = '';
              if (files.length) void processFiles(files);
            }}
          />
          {uploading ? (
            <span>
              {uploadProgress
                ? `Uploading file ${uploadProgress.current} of ${uploadProgress.total}…`
                : 'Uploading…'}
            </span>
          ) : (
            <>
              <strong>Choose CSV file(s)</strong>
              <div className="muted" style={{ marginTop: '0.35rem' }}>
                or drag & drop — multiple files supported
              </div>
            </>
          )}
        </label>
        {uploadSuccessMessage ? (
          <div className="alert alert-success" style={{ marginTop: '0.75rem' }}>
            {uploadSuccessMessage}
          </div>
        ) : null}
        {uploadError ? (
          <div
            className="alert alert-error alert-error--multiline"
            style={{ marginTop: '0.75rem' }}
          >
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
