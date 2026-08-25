import { useState, type FormEvent } from 'react';

export const recipe = { id: 'lead-generation', label: 'Lead generation form' };

export function EnquiryForm() {
  const [status, setStatus] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('Sending…');
    const form = event.currentTarget;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) if (typeof value === 'string') params.append(key, value);
    try {
      const response = await fetch('/__forms.html', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
      if (!response.ok) throw new Error('Submission failed.');
      form.reset();
      setStatus('Thanks — your enquiry has been sent.');
    } catch { setStatus('We could not send your enquiry. Please try again.'); }
  }
  return <form name="enquiry" method="POST" data-netlify="true" data-netlify-honeypot="bot-field" onSubmit={submit}>
    <input type="hidden" name="form-name" value="enquiry" />
    <p hidden><label>Do not fill this in <input name="bot-field" /></label></p>
    <label>Name <input name="name" autoComplete="name" required /></label>
    <label>Email <input name="email" type="email" autoComplete="email" required /></label>
    <label>Phone <input name="phone" type="tel" autoComplete="tel" /></label>
    <label>Message <textarea name="message" required /></label>
    <button type="submit">Send enquiry</button>
    <p aria-live="polite">{status}</p>
  </form>;
}
