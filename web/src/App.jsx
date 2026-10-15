import React, { useCallback, useState } from 'react';
import CustomerList from './components/CustomerList.jsx';
import CustomerProfile from './components/CustomerProfile.jsx';
import CustomerForm from './components/CustomerForm.jsx';

export default function App() {
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const refreshList = useCallback(() => setListVersion((v) => v + 1), []);

  const showDetail = creating || selectedId !== null;
  return (
    <div className="shell">
      <header className="topbar">
        <h1>Customers</h1>
        <button className="btn btn-light" onClick={() => { setCreating(true); setSelectedId(null); }}>Add customer</button>
      </header>
      <main className={`panes ${showDetail ? 'has-detail' : ''}`}>
        <CustomerList selectedId={selectedId} version={listVersion} onSelect={(id) => { setCreating(false); setSelectedId(id); }} />
        <section className="detail" aria-label="Customer details">
          {creating ? (
            <div className="card">
              <button className="link back" onClick={() => setCreating(false)}>Back to customers</button>
              <h2>New customer</h2>
              <CustomerForm submitLabel="Create customer" onCancel={() => setCreating(false)}
                onSubmit={async (data, api) => { const c = await api.createCustomer(data); refreshList(); setCreating(false); setSelectedId(c.id); }} />
            </div>
          ) : selectedId !== null ? (
            <CustomerProfile key={selectedId} id={selectedId} onBack={() => setSelectedId(null)} onChanged={refreshList} />
          ) : (
            <div className="placeholder"><p>Select a customer to see their orders, notes and follow-ups.</p></div>
          )}
        </section>
      </main>
    </div>
  );
}
