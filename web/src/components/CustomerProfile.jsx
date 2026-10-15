import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { dueState, fullName, initials, money, shortDate } from '../format.js';
import CustomerForm from './CustomerForm.jsx';

const CHANNELS = [['note', 'Internal note'], ['email', 'Email'], ['phone', 'Phone call'], ['sms', 'Text message']];

export default function CustomerProfile({ id, onBack, onChanged }) {
  const [data, setData] = useState({ status: 'loading' });
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [customer, orders] = await Promise.all([api.getCustomer(id), api.listOrders(id)]);
      setData({ status: 'ready', customer, orders: orders.items });
    } catch (e) { setData({ status: 'error', message: e.message }); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (data.status === 'loading') return <div className="placeholder"><p>Loading customer…</p></div>;
  if (data.status === 'error') return <div className="card"><button className="link back" onClick={onBack}>Back to customers</button><p className="notice error" role="alert">{data.message}</p><button className="btn" onClick={load}>Try again</button></div>;

  const { customer, orders } = data;
  const { summary } = customer;
  return (
    <article className="card">
      <button className="link back" onClick={onBack}>Back to customers</button>
      <header className="profile-head">
        <span className="avatar big" aria-hidden="true">{initials(customer)}</span>
        <div>
          <h2>{fullName(customer)}</h2>
          <p className="contact">{customer.email}{customer.phone && <span> · {customer.phone}</span>}</p>
          <p className="muted">Customer since {shortDate(customer.created_at)}{customer.source === 'seed' && ' · demo data'}</p>
        </div>
        {!editing && <button className="btn btn-quiet edit" onClick={() => setEditing(true)}>Edit details</button>}
      </header>

      {editing && (
        <CustomerForm initial={customer} submitLabel="Save changes" onCancel={() => setEditing(false)}
          onSubmit={async (values, apiClient) => { await apiClient.updateCustomer(id, values); setEditing(false); await load(); onChanged(); }} />
      )}

      <dl className="stats">
        <div><dt>Total spent</dt><dd className="num">{money(summary.total_spent)}</dd></div>
        <div><dt>Orders</dt><dd className="num">{summary.order_count}</dd></div>
        <div><dt>Last order</dt><dd className="num">{shortDate(summary.last_order_at)}</dd></div>
      </dl>

      <Tasks customerId={id} tasks={customer.tasks} reload={load} />
      <Notes customerId={id} notes={customer.communications} reload={load} />
      <Orders orders={orders} />
    </article>
  );
}

function Tasks({ customerId, tasks, reload }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState(null);

  async function add(e) {
    e.preventDefault(); setError(null);
    try { await api.addTask(customerId, { title, ...(due && { due_date: due }) }); setTitle(''); setDue(''); await reload(); }
    catch (err) { setError(err.details?.title ? `Title ${err.details.title}` : err.message); }
  }
  async function toggle(t) {
    try { await api.setTaskStatus(t.id, t.status === 'done' ? 'open' : 'done'); await reload(); } catch (err) { setError(err.message); }
  }
  return (
    <section aria-labelledby="h-tasks">
      <h3 id="h-tasks">Follow-ups</h3>
      {tasks.length === 0 && <p className="muted">Nothing to follow up on yet.</p>}
      <ul className="tasks">
        {tasks.map((t) => {
          const state = t.status === 'open' ? dueState(t.due_date) : null;
          return (
            <li key={t.id} className={t.status}>
              <label><input type="checkbox" checked={t.status === 'done'} onChange={() => toggle(t)} /> <span className="task-title">{t.title}</span></label>
              {t.due_date && <span className={`due ${state ?? ''}`}>{state === 'overdue' ? 'Overdue · ' : ''}{shortDate(t.due_date)}</span>}
            </li>
          );
        })}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <label className="sr-only" htmlFor="task-title">Follow-up title</label>
        <input id="task-title" placeholder="Add a follow-up" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="sr-only" htmlFor="task-due">Due date</label>
        <input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn btn-quiet" type="submit">Add follow-up</button>
      </form>
      {error && <p className="notice error" role="alert">{error}</p>}
    </section>
  );
}

function Notes({ customerId, notes, reload }) {
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState('note');
  const [error, setError] = useState(null);

  async function add(e) {
    e.preventDefault(); setError(null);
    try {
      await api.addNote(customerId, { body, channel, direction: channel === 'note' ? 'internal' : 'outbound' });
      setBody(''); await reload();
    } catch (err) { setError(err.details?.body ? `Note ${err.details.body}` : err.message); }
  }
  return (
    <section aria-labelledby="h-notes">
      <h3 id="h-notes">Notes and communication</h3>
      <form className="note-form" onSubmit={add}>
        <label className="sr-only" htmlFor="note-body">Note</label>
        <textarea id="note-body" rows="2" placeholder="Log a note or a conversation" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="actions">
          <label className="sr-only" htmlFor="note-channel">Type</label>
          <select id="note-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn btn-quiet" type="submit">Save note</button>
        </div>
      </form>
      {error && <p className="notice error" role="alert">{error}</p>}
      {notes.length === 0 ? <p className="muted">No notes yet.</p> : (
        <ul className="notes">
          {notes.map((n) => (
            <li key={n.id}>
              <span className="muted">{shortDate(n.created_at)} · {CHANNELS.find(([v]) => v === n.channel)?.[1]}{n.direction !== 'internal' && ` (${n.direction})`}</span>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Orders({ orders }) {
  return (
    <section aria-labelledby="h-orders">
      <h3 id="h-orders">Order history</h3>
      {orders.length === 0 ? <p className="muted">This customer has not placed an order yet.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Items</th><th>Status</th><th className="r">Total</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{shortDate(o.placed_at)}</td>
                  <td>{o.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</td>
                  <td><span className={`status s-${o.status}`}>{o.status}</span></td>
                  <td className="r num">{money(o.total, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
