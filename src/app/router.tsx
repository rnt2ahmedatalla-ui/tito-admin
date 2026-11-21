import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { StaffShell } from '@/components/layout/StaffShell';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/Skeleton';

const TodayPage = lazy(() => import('@/features/today/TodayPage').then((m) => ({ default: m.TodayPage })));
const RoutinePage = lazy(() => import('@/features/routine/RoutinePage').then((m) => ({ default: m.RoutinePage })));
const BookingsPage = lazy(() => import('@/features/bookings/BookingsPage').then((m) => ({ default: m.BookingsPage })));
const CampaignsPage = lazy(() => import('@/features/campaigns/CampaignsPage').then((m) => ({ default: m.CampaignsPage })));
const MorePage = lazy(() => import('@/features/more/MorePage').then((m) => ({ default: m.MorePage })));
const BackupPage = lazy(() => import('@/features/backup/BackupPage').then((m) => ({ default: m.BackupPage })));
const AuditPage = lazy(() => import('@/features/audit/AuditPage').then((m) => ({ default: m.AuditPage })));
const ExtrasPage = lazy(() => import('@/features/extras/ExtrasPage').then((m) => ({ default: m.ExtrasPage })));
const StaffPage = lazy(() => import('@/features/staff/StaffPage').then((m) => ({ default: m.StaffPage })));
const FinancePage = lazy(() => import('@/features/finance/FinancePage').then((m) => ({ default: m.FinancePage })));
const LoyaltyPage = lazy(() => import('@/features/loyalty/LoyaltyPage').then((m) => ({ default: m.LoyaltyPage })));
const CouponsPage = lazy(() => import('@/features/coupons/CouponsPage').then((m) => ({ default: m.CouponsPage })));
const ServicesPage = lazy(() => import('@/features/services/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const HoursPage = lazy(() => import('@/features/hours/HoursPage').then((m) => ({ default: m.HoursPage })));
const TimeOffPage = lazy(() => import('@/features/timeoff/TimeOffPage').then((m) => ({ default: m.TimeOffPage })));
const BreaksPage = lazy(() => import('@/features/breaks/BreaksPage').then((m) => ({ default: m.BreaksPage })));
const ProductsPage = lazy(() => import('@/features/products/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const ReviewsPage = lazy(() => import('@/features/reviews/ReviewsPage').then((m) => ({ default: m.ReviewsPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const WalkInPage = lazy(() => import('@/features/walkin/WalkInPage').then((m) => ({ default: m.WalkInPage })));
const CleanupPage = lazy(() => import('@/features/cleanup/CleanupPage').then((m) => ({ default: m.CleanupPage })));
const SeasonsPage = lazy(() => import('@/features/seasons/SeasonsPage').then((m) => ({ default: m.SeasonsPage })));
const EmergencyPage = lazy(() => import('@/features/emergency/EmergencyPage').then((m) => ({ default: m.EmergencyPage })));
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
  const { role } = useAuth();
  if (role === 'staff') {
    return (
      <HashRouter>
        <Routes>
          <Route element={<StaffShell />}>
            <Route index element={<Suspense fallback={<PageLoader />}><TodayPage /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    );
  }
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Suspense fallback={<PageLoader />}><TodayPage /></Suspense>} />
          <Route path="routine" element={<Suspense fallback={<PageLoader />}><RoutinePage /></Suspense>} />
          <Route path="payments" element={<Navigate to="/routine?t=payments" replace />} />
          <Route path="reminders" element={<Navigate to="/routine?t=new" replace />} />
          <Route path="bookings" element={<Suspense fallback={<PageLoader />}><BookingsPage /></Suspense>} />
          <Route path="more" element={<Suspense fallback={<PageLoader />}><MorePage /></Suspense>} />
          <Route path="more/services" element={<Suspense fallback={<PageLoader />}><ServicesPage /></Suspense>} />
          <Route path="more/hours" element={<Suspense fallback={<PageLoader />}><HoursPage /></Suspense>} />
          <Route path="more/time-off" element={<Suspense fallback={<PageLoader />}><TimeOffPage /></Suspense>} />
          <Route path="more/breaks" element={<Suspense fallback={<PageLoader />}><BreaksPage /></Suspense>} />
          <Route path="more/products" element={<Suspense fallback={<PageLoader />}><ProductsPage /></Suspense>} />
          <Route path="more/reviews" element={<Suspense fallback={<PageLoader />}><ReviewsPage /></Suspense>} />
          <Route path="more/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
          <Route path="more/customers" element={<Suspense fallback={<PageLoader />}><CustomersPage /></Suspense>} />
          <Route path="more/walk-in" element={<Suspense fallback={<PageLoader />}><WalkInPage /></Suspense>} />
          <Route path="more/campaigns" element={<Suspense fallback={<PageLoader />}><CampaignsPage /></Suspense>} />
          <Route path="more/seasons" element={<Suspense fallback={<PageLoader />}><SeasonsPage /></Suspense>} />
          <Route path="more/emergency" element={<Suspense fallback={<PageLoader />}><EmergencyPage /></Suspense>} />
          <Route path="more/cleanup" element={<Suspense fallback={<PageLoader />}><CleanupPage /></Suspense>} />
          <Route path="more/maintenance" element={<Suspense fallback={<PageLoader />}><MaintenancePage /></Suspense>} />
          <Route path="more/reports" element={<Navigate to="/more/finance?tab=bookingsReport" replace />} />
          <Route path="more/backup" element={<Suspense fallback={<PageLoader />}><BackupPage /></Suspense>} />
          <Route path="more/audit" element={<Suspense fallback={<PageLoader />}><AuditPage /></Suspense>} />
          <Route path="more/extras" element={<Suspense fallback={<PageLoader />}><ExtrasPage /></Suspense>} />
          <Route path="more/staff" element={<Suspense fallback={<PageLoader />}><StaffPage /></Suspense>} />
          <Route path="more/finance" element={<Suspense fallback={<PageLoader />}><FinancePage /></Suspense>} />
          <Route path="more/loyalty" element={<Suspense fallback={<PageLoader />}><LoyaltyPage /></Suspense>} />
          <Route path="more/coupons" element={<Suspense fallback={<PageLoader />}><CouponsPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
