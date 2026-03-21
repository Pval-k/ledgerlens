import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  deleteDocument,
  getDocumentInsights,
  getDocumentStatus,
  listCategoryAnalytics,
  listMonthlyAnalytics,
  listTransactions,
  type CategorySummaryRow,
  type DocumentStatusOk,
  type InsightsResponse,
  type Paged,
  type SummaryRow,
  type TransactionsPage,
} from '../api/client';

const fmtMoney = (n: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n);

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === 'COMPLETED') return 'badge badge-done';
  if (s === 'FAILED') return 'badge badge-fail';
  if (s === 'PROCESSING' || s === 'PENDING') return 'badge badge-processing';
  return 'badge badge-neutral';
}

type MonthlyChartRow = {
  month: string;
  income: number;
  expense: number;
  currency: string;
};

function buildMonthlyChartData(rows: SummaryRow[]): MonthlyChartRow[] {
  const sorted = [...rows].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  return sorted.map((r) => ({
    month: r.yearMonth,
    income: parseFloat(r.incomeTotal),
    expense: parseFloat(r.expenseTotal),
    currency: r.currency,
  }));
}

function aggregateCategoryExpense(rows: CategorySummaryRow[]) {
  const map = new Map<string, { expense: number; currency: string }>();
  for (const r of rows) {
    const label = r.categoryKey === '' ? '(uncategorized)' : r.categoryKey;
    const prev = map.get(label);
    const exp = parseFloat(r.expenseTotal);
    if (prev) {
      prev.expense += exp;
    } else {
      map.set(label, { expense: exp, currency: r.currency });
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.expense - a.expense)
    .slice(0, 14);
}

type LocationState = { filename?: string };

export function DocumentPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const titleName = (location.state as LocationState | null)?.filename ?? null;
  const [status, setStatus] = useState<DocumentStatusOk | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<Paged<SummaryRow> | null>(null);
  const [byCat, setByCat] = useState<Paged<CategorySummaryRow> | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [tx, setTx] = useState<TransactionsPage | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [analyticsErr, setAnalyticsErr] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const txLimit = 25;

  async function onDeleteDocument() {
    if (!window.confirm('Delete this document? This cannot be undone.')) {
      return;
    }
    setDeleteErr(null);
    setDeleting(true);
    try {
      await deleteDocument(id);
      navigate('/dashboard');
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const loadAnalytics = useCallback(async () => {
    setAnalyticsErr(null);
    try {
      const [m, c, ins] = await Promise.all([
        listMonthlyAnalytics(id, { limit: 120 }),
        listCategoryAnalytics(id, { limit: 500 }),
        getDocumentInsights(id),
      ]);
      setMonthly(m);
      setByCat(c);
      setInsights(ins);
    } catch (e) {
      setAnalyticsErr(e instanceof Error ? e.message : 'Analytics failed');
    }
  }, [id]);

  const loadTx = useCallback(async () => {
    const page = await listTransactions(id, txPage, txLimit);
    setTx(page);
  }, [id, txPage]);

  useEffect(() => {
    let cancelled = false;
    const iv = setInterval(async () => {
      try {
        const s = await getDocumentStatus(id);
        if (cancelled) return;
        setStatus(s);
        if (s.status === 'COMPLETED' || s.status === 'FAILED') {
          clearInterval(iv);
        }
      } catch (e) {
        if (cancelled) return;
        setStatusErr(e instanceof Error ? e.message : 'Not found');
        setStatus(null);
        clearInterval(iv);
      }
    }, 2000);
    void (async () => {
      try {
        const s = await getDocumentStatus(id);
        if (cancelled) return;
        setStatus(s);
      } catch (e) {
        if (cancelled) return;
        setStatusErr(e instanceof Error ? e.message : 'Not found');
        setStatus(null);
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [id]);

  useEffect(() => {
    if (!status || status.status !== 'COMPLETED') return;
    let cancelled = false;
    void (async () => {
      await loadAnalytics();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [status, loadAnalytics]);

  useEffect(() => {
    if (!status || status.status !== 'COMPLETED') return;
    void loadTx();
  }, [txPage, status, loadTx]);

  const monthlyData = useMemo(
    () => (monthly ? buildMonthlyChartData(monthly.items) : []),
    [monthly],
  );

  const categoryData = useMemo(
    () => (byCat ? aggregateCategoryExpense(byCat.items) : []),
    [byCat],
  );

  const palette = [
    '#0d9488',
    '#f97316',
    '#6366f1',
    '#ec4899',
    '#8b5cf6',
    '#14b8a6',
    '#f59e0b',
    '#64748b',
  ];

  if (statusErr) {
    return (
      <div className="card">
        <p className="alert alert-error">{statusErr}</p>
        <Link to="/dashboard">← Back</Link>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="card">
        <div className="skeleton" style={{ height: 160 }} />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row" style={{ marginBottom: '0.25rem' }}>
        <Link to="/dashboard" className="muted" style={{ fontSize: '0.875rem' }}>
          ← Documents
        </Link>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.25rem' }}>
              {titleName ?? `${status.documentId.slice(0, 8)}…`}
            </h1>
            <p className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
              Updated {fmtDate(status.updatedAt)}
            </p>
          </div>
          <div className="row" style={{ gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-danger-ghost"
              disabled={deleting}
              onClick={() => void onDeleteDocument()}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <span className={statusBadge(status.status)}>{status.status}</span>
          </div>
        </div>
        {deleteErr ? (
          <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
            {deleteErr}
          </div>
        ) : null}
        {status.ingestError ? (
          <div className="alert alert-error" style={{ marginTop: '1rem' }}>
            {status.ingestError}
          </div>
        ) : null}
        <div
          className="row"
          style={{ marginTop: '1rem', gap: '1.5rem', fontSize: '0.9rem' }}
        >
          <div>
            <div className="muted">Transactions</div>
            <div className="num" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {status.transactionCount}
            </div>
          </div>
          <div>
            <div className="muted">Size</div>
            <div>
              {status.sizeBytes != null
                ? `${(status.sizeBytes / 1024).toFixed(1)} KB`
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {status.status === 'COMPLETED' ? (
        <>
          {analyticsErr ? (
            <div className="alert alert-error">{analyticsErr}</div>
          ) : null}

          {insights ? (
            <div className="card">
              <h2 className="card__title">Insights</h2>
              <p className="muted" style={{ marginTop: '-0.5rem' }}>
                {insights.message}
              </p>
            </div>
          ) : null}

          <div className="card">
            <h2 className="card__title">Cash flow by month</h2>
            <p className="muted" style={{ marginTop: '-0.5rem' }}>
              Income vs expense totals (UTC month buckets).
            </p>
            {monthlyData.length === 0 ? (
              <p className="empty-hint">No summary rows yet.</p>
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} barGap={4} barCategoryGap="18%">
                    <CartesianGrid
                      strokeDasharray="4 4"
                      vertical={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        fmtMoney(Number(v), monthlyData[0]?.currency ?? 'USD')
                      }
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        fmtMoney(value, monthlyData[0]?.currency ?? 'USD'),
                        name === 'income' ? 'Income' : 'Expense',
                      ]}
                      labelFormatter={(l) => String(l)}
                      contentStyle={{
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <Bar
                      dataKey="income"
                      fill="var(--chart-income)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                    <Bar
                      dataKey="expense"
                      fill="var(--chart-expense)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="card__title">Spending by category</h2>
            <p className="muted" style={{ marginTop: '-0.5rem' }}>
              Sum of expense magnitudes across months (top categories).
            </p>
            {categoryData.length === 0 ? (
              <p className="empty-hint">No category breakdown.</p>
            ) : (
              <div className="chart-wrap chart-wrap--tall">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={categoryData}
                    margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 4"
                      horizontal={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      type="number"
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        fmtMoney(Number(v), categoryData[0]?.currency ?? 'USD')
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: 'var(--text)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value: number) =>
                        fmtMoney(value, categoryData[0]?.currency ?? 'USD')
                      }
                      contentStyle={{
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <Bar dataKey="expense" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {categoryData.map((d, i) => (
                        <Cell
                          key={d.name}
                          fill={palette[i % palette.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="card__title">Transactions</h2>
            {!tx ? (
              <div className="skeleton" style={{ height: 200 }} />
            ) : tx.items.length === 0 ? (
              <p className="empty-hint">No rows.</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Posted</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tx.items.map((row) => (
                        <tr key={row.id}>
                          <td>{fmtDate(row.postedAt)}</td>
                          <td>{row.description ?? '—'}</td>
                          <td>{row.category ?? '—'}</td>
                          <td className="num">
                            {fmtMoney(parseFloat(row.amount), row.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={txPage <= 1}
                    onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span>
                    Page {tx.page} of {Math.max(1, Math.ceil(tx.total / tx.limit))}{' '}
                    ({tx.total} total)
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={txPage * tx.limit >= tx.total}
                    onClick={() => setTxPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="card">
          <p className="muted">
            {status.status === 'FAILED'
              ? 'Ingest failed — see error above.'
              : 'Processing… summaries and transactions appear when status is COMPLETED.'}
          </p>
        </div>
      )}
    </div>
  );
}
