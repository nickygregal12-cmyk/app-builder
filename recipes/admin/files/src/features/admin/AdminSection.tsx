import { AdminBoundary, AdminShell } from '.';

export function AdminSection() {
  return <AdminBoundary fallback={<div role="status" data-admin-access="denied">
    <strong>Administrator access required</strong>
    <p>This area is available only to a platform administrator.</p>
  </div>}>
    <AdminShell title="Platform administration">
      <p data-admin-access="granted">You are signed in with platform administrator access.</p>
      <p>Privileged operations must still enforce their own server or database authorization.</p>
    </AdminShell>
  </AdminBoundary>;
}
