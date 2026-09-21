import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { AuthGate } from '@/components/auth/Gate';
import { AppRouter } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 5 * 60 * 1000,
    },
  },
});

export function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <AppRouter />
        </AuthGate>
      </AuthProvider>
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
