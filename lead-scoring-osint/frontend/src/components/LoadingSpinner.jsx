import React from 'react';

const LoadingSpinner = ({ 
  size = 'medium', 
  color = 'indigo', 
  fullScreen = false,
  message = null 
}) => {
  const sizeClasses = {
    small: 'h-4 w-4',
    medium: 'h-8 w-8',
    large: 'h-12 w-12',
    xlarge: 'h-16 w-16'
  };

  const colorClasses = {
    indigo: 'text-indigo-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    gray: 'text-gray-600',
    white: 'text-white'
  };

  const spinner = (
    <div className="flex flex-col items-center justify-center">
      <svg 
        className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]}`}
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24 24"
      >
        <circle 
          className="opacity-25" 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          strokeWidth="4"
        />
        <path 
          className="opacity-75" 
          fill="currentColor" 
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {message && (
        <p className={`mt-4 text-sm ${color === 'white' ? 'text-white' : 'text-gray-600'}`}>
          {message}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-gray-50 bg-opacity-75 flex items-center justify-center z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
};

// Specialized loading states
export const PageLoader = ({ message = 'Loading...' }) => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <LoadingSpinner size="large" message={message} />
  </div>
);

export const CardLoader = ({ message }) => (
  <div className="bg-white rounded-lg shadow p-8 flex items-center justify-center">
    <LoadingSpinner size="medium" message={message} />
  </div>
);

export const InlineLoader = ({ message }) => (
  <div className="inline-flex items-center space-x-2">
    <LoadingSpinner size="small" />
    {message && <span className="text-sm text-gray-600">{message}</span>}
  </div>
);

export const ButtonLoader = ({ color = 'white' }) => (
  <LoadingSpinner size="small" color={color} />
);

export default LoadingSpinner;