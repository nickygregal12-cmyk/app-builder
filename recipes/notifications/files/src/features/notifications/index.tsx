export const recipe = { id: 'notifications', label: 'In-app notifications' };

// The composer places a notifications section on the surface an application is
// caught up on; this recipe owns how it renders and how it reaches the
// database. Nothing here creates a notification — the database raises one when
// a real application event happens, and no client holds the privilege to
// insert one.
export { NotificationsProvider as Provider } from './NotificationsContext';
export {
  useNotifications,
  type AppNotification,
  type NotificationKind,
} from './NotificationsContext';

import { NotificationsSection } from './NotificationsSection';
export { NotificationsSection };
export const sections = { notifications: NotificationsSection };
