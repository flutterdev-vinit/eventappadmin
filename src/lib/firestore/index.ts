// Barrel export — import from `../lib/firestore` in app code.

export { sanitize, sanitizeDoc } from './sanitize';
export { PAGE_SIZE, type Page } from './pagination';

export {
  fetchEvents,
  fetchEventCount,
  fetchPublishedEventCount,
  fetchRecentEvents,
  fetchEventsForCharts,
  fetchEventsPage,
  searchEvents,
  fetchEventById,
  fetchEventsByOrganiser,
  fetchEventNames,
  updateEvent,
  deleteEvent,
  fetchAttendeeCountForEvent,
  fetchTotalAttendeeCount,
  fetchAttendedEventsByUser,
  fetchAttendeesForEvent,
  fetchCategoryMap,
  type AttendedEventRow,
  type AttendeeWithUser,
} from './events';

export {
  searchUsers,
  fetchUsers,
  fetchUserNames,
  fetchUserById,
  fetchUserCount,
  fetchRecentUsers,
  fetchUsersPage,
  updateUser,
} from './users';

export {
  fetchPaymentsByUser,
  fetchCompletedPaymentCountForEvent,
  fetchPayments,
  fetchRecentPayments,
  fetchPaymentsPage,
  fetchPaymentCount,
  fetchPaymentRevenue,
  fetchPaymentsForCharts,
  fetchPaymentStatusCounts,
} from './payments';

export {
  fetchMessageCountForEvent,
  fetchTotalMessageCount,
  fetchEventsActivity,
  type EventActivity,
} from './messages';

export {
  fetchAdminStats,
  refreshAdminStats,
  fetchAnalyticsCache,
  refreshAnalyticsCache,
  type AdminStats,
  type AnalyticsCache,
} from './adminCache';

export {
  logAdminAction,
  type AuditActionType,
  type AuditTargetKind,
  type AuditEntry,
} from './audit';

export {
  logClientError,
  type ClientErrorContext,
} from './errors';

export {
  uploadImage,
  deleteImageByUrl,
  type UploadedImage,
} from './storage';

export {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  countEventsUsingCategory,
  type CategoryInput,
} from './categories';

export {
  listGalleryForCategory,
  addGalleryImage,
  deleteGalleryImage,
  type AddGalleryImageInput,
} from './gallery';

export {
  listReports,
  getReportsForEvent,
  resolveReport,
  dismissReport,
  countReportsByStatus,
  type ListReportsOptions,
  type ReportCounts,
} from './reports';

export {
  getBankAccountByUserId,
} from './bankAccounts';

export {
  listPayouts,
  countPayoutsByStatus,
  createPayout,
  updatePayoutStatus,
  type ListPayoutsOptions,
  type CreatePayoutInput,
  type UpdatePayoutStatusInput,
  type PayoutCounts,
} from './payouts';
