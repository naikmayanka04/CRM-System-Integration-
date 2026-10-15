import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fullName, initials, money, orderLabel } from '../format.js';

const PAGE = 25;

export default function CustomerList({ selectedId, version, onSelect }) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [state, setState] = useState({ status: 'loading', items: [], total: 0, error: null });

  useEffect(() => { const t = setTimeout(() => setQ(input.trim()), 250); return () => clearTimeout(t); }, [input]);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    api.listCustomers({ q, limit: PAGE, offset: 0 })
      .then((r) => { if (!cancelled) setState({ status: 'ready', items: r.items, total: r.total, error: null }); })
      .catch((e) => { if (!cancelled) setState({ status: 'error', items: [], total: 0, error: e.message }); });
    return () => { cancelled = true; };
  }, [q, version]);

  async function loadMore() {
    try {
      const r = await api.listCustomers({ q, limit: PAGE, offset: state.items.length });
      setState((s) => ({ ...s, items: [...s.items, ...r.items], total: r.total }));
    } catch (e) { setState((s) => ({ ...s, error: e.message })); }
  }

  return (
    <nav className="list" aria-label="Customer list">
      <div className="search">
        <label htmlFor="search" className="sr-only">Search customers</label>
        <input id="search" type="search" placeholder="Search by name, email or phone" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" />
      </div>
      <div className="list-body" aria-busy={state.status === 'loading'}>
        {state.status === 'error' && <p className="notice error" role="alert">{state.error}</p>}
        {state.status === 'loading' && state.items.length === 0 && <p className="notice">Loading customers…</p>}
        {state.status === 'ready' && state.items.length === 0 && (
          <p className="notice">{q ? `No customers match “${q}”. Try a different name, email or phone number.` : 'No customers yet. Add one, or sync from your store.'}</p>
        )}
        <ul>
          {state.items.map((c) => (
            <li key={c.id}>
              <button className={`row ${c.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(c.id)} aria-current={c.id === selectedId ? 'true' : undefined}>
                <span className="avatar" aria-hidden="true">{initials(c)}</span>
                <span className="row-main">
                  <span className="row-name">{fullName(c)}</span>
                  <span className="row-sub">{c.email}</span>
                </span>
                <span className="row-meta">
                  <span className="num">{money(c.total_spent)}</span>
                  <span className="row-sub">{orderLabel(c.order_count)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {state.items.length < state.total && <button className="btn btn-quiet more" onClick={loadMore}>Show more ({state.total - state.items.length} left)</button>}
      </div>
      <p className="list-foot" aria-live="polite">{state.status === 'ready' ? `${state.total} ${state.total === 1 ? 'customer' : 'customers'}` : ''}</p>
    </nav>
  );
}
