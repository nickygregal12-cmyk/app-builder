import { useState } from 'react';
import './notifications.css';
import { useNotifications, type AppNotification } from './NotificationsContext';

/**
 * The notifications surface of a generated application.
 *
 * Plain by intent, like the records and files surfaces beside it. This slice
 * proves that a real application event can reach the right person and that the
 * read state survives a reload; it is not an attempt at the visual system and
 * it adds no design vocabulary of its own — every custom property below is one
 * the compiled design system already declares.
 *
 * It shows no identifiers. A person sees what happened, when, and whether they
 * have seen it before. The notification's uuid, the recipient's uuid, the
 * organisation's uuid and the kind string are all real and all internal; the
 * only one that reaches the DOM is an id on the list item, as a test hook,
 * which is the same accommodation the records surface already makes.
 */

/**
 * Relative time, and only to the granularity a person can act on.
 *
 * An exact timestamp is also rendered, in the element's `title` and in a
 * `<time datetime>`, so nothing is lost — but "3 minutes ago" is what makes an
 * inbox readable at a glance, and a list of ISO strings is not a product.
 */
function relativeTime(value: string) {
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
}

function NotificationRow({ notification }: { notification: AppNotification }) {
  const { markRead } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const unread = notification.read_at === null;

  async function acknowledge() {
    setBusy(true);
    setFailure(null);
    try { await markRead(notification.id); } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That notification could not be marked read.');
    } finally { setBusy(false); }
  }

  return <li
    className={`content-card notification-card${unread ? ' notification-card-unread' : ''}`}
    data-notification-id={notification.id}
    data-notification-state={unread ? 'unread' : 'read'}
  >
    <div className="notification-identity">
      <p className="notification-title">
        {/* Announced as well as shown. A dot that only exists in colour and
            position tells a screen-reader user nothing about which of these
            they still have to deal with. */}
        {unread && <span className="notification-flag">Unread<span aria-hidden="true"> · </span></span>}
        {notification.title}
      </p>
      {notification.body && <p className="notification-body">{notification.body}</p>}
      <p className="notification-meta">
        <time dateTime={notification.created_at} title={new Date(notification.created_at).toLocaleString()}>
          {relativeTime(notification.created_at)}
        </time>
      </p>
    </div>
    {unread && <div className="notification-actions">
      <button className="button secondary-action" type="button" disabled={busy} onClick={acknowledge}>
        {busy ? 'Marking…' : 'Mark read'}
      </button>
    </div>}
    {failure && <p className="notification-status notification-status-failed" role="alert">{failure}</p>}
  </li>;
}

export function NotificationsSection() {
  const { organisation, notifications, unreadCount, loading, error } = useNotifications();

  // Not a member of anything is a real state rather than an error, and it is
  // told plainly instead of being shown an empty inbox that looks broken.
  if (!organisation) {
    return <div className="notifications-panel">
      <p className="notification-empty">You are not a member of an organisation yet. Create one to start receiving notifications.</p>
    </div>;
  }

  return <div className="notifications-panel" data-organisation-id={organisation.id}>
    <p className="notifications-context">
      Notifications for <strong>{organisation.name}</strong>
      {unreadCount > 0 && <span className="notification-count"> · {unreadCount} unread</span>}
    </p>

    {loading && <p className="notification-loading" aria-live="polite">Loading notifications…</p>}
    {error && <p className="notification-status notification-status-failed" role="alert">{error}</p>}

    {!loading && !error && notifications.length === 0
      && <p className="notification-empty">Nothing to catch up on. New activity in this organisation will appear here.</p>}

    {notifications.length > 0 && <ul className="notification-list">
      {notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} />)}
    </ul>}
  </div>;
}
