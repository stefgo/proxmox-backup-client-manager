import { lazy } from 'react';

// Page components – loaded on demand, so a chunk only arrives when its route does.
// A `.ts` file of its own: the route files next to it export route elements and the
// tree, and Fast Refresh wants a file to export components or other things, not both.
export const DashboardOverview = lazy(() => import('../dashboard/components/DashboardOverview').then(m => ({ default: m.DashboardOverview })));
export const ManagedClients = lazy(() => import('../clients/components/ManagedClients').then(m => ({ default: m.ManagedClients })));
export const ClientOverview = lazy(() => import('../clients/components/ClientOverview').then(m => ({ default: m.ClientOverview })));
export const AddClientWizard = lazy(() => import('../clients/components/add-client/AddClientWizard').then(m => ({ default: m.AddClientWizard })));
export const ClientEditor = lazy(() => import('../clients/components/ClientEditor').then(m => ({ default: m.ClientEditor })));
export const ClientTunnelEditor = lazy(() => import('../clients/components/ClientTunnelEditor').then(m => ({ default: m.ClientTunnelEditor })));
export const JobEditorPage = lazy(() => import('../jobs/components/JobEditorPage').then(m => ({ default: m.JobEditorPage })));
export const ManagedRepositories = lazy(() => import('../repositories/components/ManagedRepositories').then(m => ({ default: m.ManagedRepositories })));
export const RepositoryOverview = lazy(() => import('../repositories/components/RepositoryOverview').then(m => ({ default: m.RepositoryOverview })));
export const RepositoryEditor = lazy(() => import('../repositories/components/RepositoryEditor').then(m => ({ default: m.RepositoryEditor })));
export const SnapshotRestoreEditor = lazy(() => import('../repositories/components/SnapshotRestoreEditor').then(m => ({ default: m.SnapshotRestoreEditor })));
export const ManagedJobs = lazy(() => import('../jobs/components/ManagedJobs').then(m => ({ default: m.ManagedJobs })));
export const HistoryOverview = lazy(() => import('../history/components/HistoryOverview').then(m => ({ default: m.HistoryOverview })));
export const UserOverview = lazy(() => import('../users/components/UserOverview').then(m => ({ default: m.UserOverview })));
export const TokenOverview = lazy(() => import('../tokens/components/TokenOverview').then(m => ({ default: m.TokenOverview })));
export const WebhookOverview = lazy(() => import('../webhooks/components/WebhookOverview').then(m => ({ default: m.WebhookOverview })));
export const WebhookEditorRoute = lazy(() => import('../webhooks/components/WebhookEditor').then(m => ({ default: m.WebhookEditorRoute })));
export const Settings = lazy(() => import('../../pages/Settings'));
