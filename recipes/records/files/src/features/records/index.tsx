export const recipe = { id: 'records', label: 'Organisation records' };

// The composer places a tenant-records section on a workspace surface wherever
// this capability is installed; this recipe owns how it renders and how it
// talks to the database.
export { RecordsProvider as Provider } from './RecordsContext';
export { useRecords, recordPermissions, CONTRIBUTOR_ROLES, RECORD_ADMIN_ROLES, type TenantRecord, type RecordStatus, type RecordDraft } from './RecordsContext';

import { RecordsSection } from './RecordsSection';
export { RecordsSection };
export const sections = { 'tenant-records': RecordsSection };
