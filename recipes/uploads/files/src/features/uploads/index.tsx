export const recipe = { id: 'uploads', label: 'Organisation files' };

// The composer places an organisation-files section on a workspace surface
// wherever this capability is installed; this recipe owns how it renders and
// how it reaches Supabase Storage.
export { FilesProvider as Provider } from './FilesContext';
export {
  useOrganisationFiles,
  filePermissions,
  displayName,
  BUCKET,
  MAX_FILE_BYTES,
  ACCEPTED_TYPES,
  CONTRIBUTOR_ROLES,
  FILE_ADMIN_ROLES,
  type OrganisationFile,
} from './FilesContext';

import { FilesSection } from './FilesSection';
export { FilesSection };
export const sections = { 'organisation-files': FilesSection };
