import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import StatusPage from './pages/StatusPage';
import BillingPage from './pages/BillingPage';
import PaymentPage from './pages/PaymentPage';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                style: {
                  background: '#10b981',
                },
              },
              error: {
                style: {
                  background: '#ef4444',
                },
              },
            }}
          />
          
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            
            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ErrorBoundary>
                      <DashboardPage />
                    </ErrorBoundary>
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/upload"
              element={
                <ProtectedRoute requireSubscription>
                  <Layout>
                    <ErrorBoundary>
                      <UploadPage />
                    </ErrorBoundary>
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/status"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ErrorBoundary>
                      <StatusPage />
                    </ErrorBoundary>
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/billing"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ErrorBoundary>
                      <BillingPage />
                    </ErrorBoundary>
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/payment"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ErrorBoundary>
                      <PaymentPage />
                    </ErrorBoundary>
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;