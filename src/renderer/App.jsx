import React from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';
import { ToastProvider } from './context/ToastContext';
import AppRoutes from './routes/AppRoutes';
import ErrorBoundary from './components/common/ErrorBoundary';
import { UpdateStatusBanner } from './components/updater/UpdateStatusBanner';

function RouteAwareErrorBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={`${location.pathname}${location.search}`}>{children}</ErrorBoundary>;
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <BranchProvider>
            <RouteAwareErrorBoundary>
              <AppRoutes />
            </RouteAwareErrorBoundary>
            <UpdateStatusBanner />
          </BranchProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
