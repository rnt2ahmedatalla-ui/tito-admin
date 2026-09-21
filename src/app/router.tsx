import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Skeleton } from '@/components/ui/Skeleton';

const TodayPage = lazy(() => import('@/features/today/TodayPage').then((m) => ({ default: m.TodayPage })));
const PaymentsPage = lazy(() => import('@/features/payments/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const RemindersPage = lazy(() => import('@/features/reminders/RemindersPage').then((m) => ({ default: m.RemindersPage })));
const BookingsPage = lazy(() => import('@/features/bookings/BookingsPage').then((m) => ({ default: m.BookingsPage })));
const MorePage = lazy(() => import('@/features/more/MorePage').then((m) => ({ default: m.MorePage })));
const ServicesPage = lazy(() => import('@/features/services/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const HoursPage = lazy(() => import('@/features/hours/HoursPage').then((m) => ({ default: m.HoursPage })));
const TimeOffPage = lazy(() => import('@/features/timeoff/TimeOffPage').then((m) => ({ default: m.TimeOffPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const WalkInPage = lazy(() => import('@/features/walkin/WalkInPage').then((m) => ({ default: m.WalkInPage })));
const MaintenancePage = lazy(() => import('@/features/maintenance/MaintenancePage').then((m) => ({ default: m.MaintenancePage })));

function PageLoader() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64" />
    </div>
  );
}

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Suspense fallback={<PageLoader />}><TodayPage /></Suspense>} />
          <Route path="payments" element={<Suspense fallback={<PageLoader />}><PaymentsPage /></Suspense>} />
          <Route path="reminders" element={<Suspense fallback={<PageLoader />}><RemindersPage /></Suspense>} />
          <Route path="bookings" element={<Suspense fallback={<PageLoader />}><BookingsPage /></Suspense>} />
          <Route path="more" element={<Suspense fallback={<PageLoader />}><MorePage /></Suspense>} />
          <Route path="more/services" element={<Suspense fallback={<PageLoader />}><ServicesPage /></Suspense>} />
          <Route path="more/hours" element={<Suspense fallback={<PageLoader />}><HoursPage /></Suspense>} />
          <Route path="more/time-off" element={<Suspense fallback={<PageLoader />}><TimeOffPage /></Suspense>} />
          <Route path="more/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
          <Route path="more/customers" element={<Suspense fallback={<PageLoader />}><CustomersPage /></Suspense>} />
          <Route path="more/walk-in" element={<Suspense fallback={<PageLoader />}><WalkInPage /></Suspense>} />
          <Route path="more/maintenance" element={<Suspense fallback={<PageLoader />}><MaintenancePage /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
