import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import MainLayout from '../layouts/MainLayout';

// Pages
import Login from '../pages/Auth';
import Setup from '../pages/Setup';
import Dashboard from '../pages/Dashboard';
import POS from '../pages/POS';
import Rentals from '../pages/Rentals';
import RentalInventory from '../pages/Inventory';
import Alterations from '../pages/Alterations';
import Tailoring from '../pages/Tailoring';
import Customers from '../pages/Customers';
import Suppliers from '../pages/Suppliers';
import Employees from '../pages/Employees';
import Expenses from '../pages/Expenses';
import Reports from '../pages/Reports';
import Barcodes from '../pages/Barcodes';
import Settings from '../pages/Settings';
import WornProducts from '../pages/WornProducts';
import NotFound from '../pages/NotFound';

import { useAuth } from '../context/AuthContext';

function IndexRedirect() {
  const { user, isAdmin, hasPermission } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin || hasPermission('Dashboard.html')) return <Navigate to="/dashboard" replace />;
  if (hasPermission('index.html')) return <Navigate to="/pos" replace />;
  if (hasPermission('Rentals.html')) return <Navigate to="/rentals" replace />;
  if (hasPermission('Customers.html')) return <Navigate to="/customers" replace />;
  if (hasPermission('Suppliers.html')) return <Navigate to="/suppliers" replace />;
  if (hasPermission('RentalInventory.html')) return <Navigate to="/rental-inventory" replace />;
  if (hasPermission('Alterations.html')) return <Navigate to="/alterations" replace />;
  if (hasPermission('Tailoring.html')) return <Navigate to="/tailoring" replace />;
  if (hasPermission('Employees.html')) return <Navigate to="/employees" replace />;
  if (hasPermission('Expenses.html')) return <Navigate to="/expenses" replace />;
  if (hasPermission('Reports.html')) return <Navigate to="/reports" replace />;
  if (hasPermission('Barcodes.html')) return <Navigate to="/barcodes" replace />;
  if (hasPermission('WornProducts.html')) return <Navigate to="/worn-products" replace />;
  return <Navigate to="/dashboard" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />

      {/* Protected Routes inside Main Shell Layout */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<IndexRedirect />} />
        <Route path="dashboard" element={<ProtectedRoute permission="Dashboard.html"><Dashboard /></ProtectedRoute>} />
        <Route path="pos" element={<ProtectedRoute permission="index.html"><POS /></ProtectedRoute>} />
        <Route path="rentals" element={<ProtectedRoute permission="Rentals.html"><Rentals /></ProtectedRoute>} />
        <Route path="rental-inventory" element={<ProtectedRoute permission="RentalInventory.html"><RentalInventory /></ProtectedRoute>} />
        <Route path="alterations" element={<ProtectedRoute permission="Alterations.html"><Alterations /></ProtectedRoute>} />
        <Route path="tailoring" element={<ProtectedRoute permission="Tailoring.html"><Tailoring /></ProtectedRoute>} />
        <Route path="customers" element={<ProtectedRoute permission="Customers.html"><Customers /></ProtectedRoute>} />
        <Route path="suppliers" element={<ProtectedRoute permission="Suppliers.html"><Suppliers /></ProtectedRoute>} />
        <Route path="employees" element={<ProtectedRoute permission="Employees.html"><Employees /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute permission="Expenses.html"><Expenses /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute permission="Reports.html"><Reports /></ProtectedRoute>} />
        <Route path="barcodes" element={<ProtectedRoute permission="Barcodes.html"><Barcodes /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute adminOnly={true}><Settings /></ProtectedRoute>} />
        <Route path="worn-products" element={<ProtectedRoute permission="WornProducts.html"><WornProducts /></ProtectedRoute>} />
      </Route>

      {/* 404 Fallback */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
