import React, { useState } from 'react';
import { api, ApiError } from '../api.js';

const FIELDS = [
  ['first_name', 'First name', 'text'],
  ['last_name', 'Last name', 'text'],
  ['email', 'Email', 'email'],
  ['phone', 'Phone', 'tel'],
];

/** Shared create/edit form. onSubmit(data, api) may throw ApiError; field errors are shown inline. */
export default function CustomerForm({ initial = {}, submitLabel, onSubmit, onCancel }) {
  const [values, setValues] = useState({ first_name: '', last_name: '', email: '', phone: '', ...initial });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await onSubmit(Object.fromEntries(FIELDS.map(([k]) => [k, values[k] ?? ''])), api);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_failed') setErrors(err.details);
      else setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {FIELDS.map(([key, label, type]) => (
        <div className="field" key={key}>
          <label htmlFor={`f-${key}`}>{label}</label>
          <input id={`f-${key}`} type={type} value={values[key] ?? ''} aria-invalid={errors[key] ? 'true' : undefined} aria-describedby={errors[key] ? `e-${key}` : undefined}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
          {errors[key] && <span className="field-error" id={`e-${key}`}>{label} {errors[key]}</span>}
        </div>
      ))}
      {formError && <p className="notice error" role="alert">{formError}</p>}
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        <button className="btn btn-quiet" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
