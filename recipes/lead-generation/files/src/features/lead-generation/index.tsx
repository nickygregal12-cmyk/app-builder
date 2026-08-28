import { useState, type FormEvent } from 'react';

export const recipe = { id: 'lead-generation', label: 'Lead generation form' };

// The composer places an enquiry-form section wherever this capability is
// installed and the page is a contact surface; this recipe owns how it renders.
export const sections = { 'enquiry-form': EnquiryForm };

export function EnquiryForm() {
  // The outcome, not just its wording. A failure rendered in the same quiet
  // grey as a success is the state an independent review called "visually
  // weak", and a visitor whose enquiry has just been lost is the last person
  // who should have to notice a sentence.
  const [status, setStatus] = useState<{ tone: 'idle' | 'pending' | 'sent' | 'failed'; message: string }>({ tone: 'idle', message: '' });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ tone: 'pending', message: 'Sending…' });
    const form = event.currentTarget;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) if (typeof value === 'string') params.append(key, value);
    try {
      const response = await fetch('/__forms.html', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
      if (!response.ok) throw new Error('Submission failed.');
      // Only a send that succeeded may clear what someone typed. A failure
      // keeps it, so retrying is pressing the button again.
      form.reset();
      setStatus({ tone: 'sent', message: 'Thanks — your enquiry has been sent.' });
    } catch {
      setStatus({ tone: 'failed', message: 'We could not send your enquiry. Nothing you typed has been lost — try again, or reach us using the contact details on this page.' });
    }
  }
  return <form className="enquiry-form" name="enquiry" method="POST" data-netlify="true" data-netlify-honeypot="bot-field" onSubmit={submit}>
    <input type="hidden" name="form-name" value="enquiry" />
    <p hidden><label>Do not fill this in <input name="bot-field" /></label></p>
    <label>Name <input name="name" autoComplete="name" required /></label>
    <label>Email <input name="email" type="email" autoComplete="email" required /></label>
    <label>Phone <input name="phone" type="tel" autoComplete="tel" /></label>
    <label className="span-two">Message <textarea name="message" rows={5} required /></label>
    <div className="enquiry-actions">
      <button className="button primary-action" type="submit">Send enquiry</button>
      {/* `role="alert"` only for the outcome a visitor has to act on. Announcing
          "Sending…" that way interrupts a screen reader mid-task for a state
          that resolves on its own. */}
      <p
        className={`enquiry-status enquiry-status-${status.tone}`}
        role={status.tone === 'failed' ? 'alert' : undefined}
        aria-live="polite"
        hidden={status.tone === 'idle'}
      >{status.message}</p>
    </div>
  </form>;
}
