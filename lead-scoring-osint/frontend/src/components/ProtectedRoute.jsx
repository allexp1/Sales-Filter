import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ 
  children, 
  requireSubscription = false,
  requiredFeature = null,
  requiredPlan = null
}) => {
  const location = useLocation();
  const { user, loading, hasActiveSubscription, canAccessFeature, subscription } = useAuth();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check subscription requirements
  if (requireSubscription && !hasActiveSubscription()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-yellow-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Subscription Required
          </h3>
          <p className="text-gray-600 mb-6">
            You need an active subscription to access this feature.
          </p>
          <button
            onClick={() => window.location.href = '/billing'}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            View Plans
          </button>
        </div>
      </div>
    );
  }

  // Check feature access
  if (requiredFeature && !canAccessFeature(requiredFeature)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Feature Not Available
          </h3>
          <p className="text-gray-600 mb-6">
            This feature is not available in your current plan. Please upgrade to access it.
          </p>
          <button
            onClick={() => window.location.href = '/billing'}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Upgrade Plan
          </button>
        </div>
      </div>
    );
  }

  // Check required plan
  if (requiredPlan) {
    const planHierarchy = ['starter', 'professional', 'enterprise'];
    const userPlanIndex = planHierarchy.indexOf(subscription?.plan_id || 'starter');
    const requiredPlanIndex = planHierarchy.indexOf(requiredPlan);
    
    if (userPlanIndex < requiredPlanIndex) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-indigo-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V7a1 1 0 00-1-1H5a1 1 0 00-1 1v9m0 0h2m2 0h2m2 0h2m2 0h2m2 0h2M8 7h1m0 0h2m2 0h2m2 0h2m2 0h1"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} Plan Required
            </h3>
            <p className="text-gray-600 mb-6">
              This feature requires the {requiredPlan} plan or higher. You're currently on the {subscription?.plan_id || 'starter'} plan.
            </p>
            <button
              onClick={() => window.location.href = '/billing'}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Upgrade to {requiredPlan}
            </button>
          </div>
        </div>
      );
    }
  }

  // All checks passed, render children
  return children;
};

export default ProtectedRoute;