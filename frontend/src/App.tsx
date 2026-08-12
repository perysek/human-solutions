import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { ToastProvider } from '@/lib/feedback/ToastProvider';
import { ConfirmProvider } from '@/lib/feedback/ConfirmProvider';
import { AppRoutes } from './router';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
