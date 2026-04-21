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
  type AuditEntry,
} from './audit';
