import React from 'react';

const Loading = ({ message = 'Loading...', size = 'default' }) => {
  const sizeClasses = {
    small: 'h-4 w-4',
    default: 'h-8 w-8',
    large: 'h-12 w-12'
  };

  return (
    <div className="flex items-center justify-center p-8">
      <div className="text-center">
        <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]} mx-auto mb-4`}></div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
};

export const LoadingOverlay = ({ message = 'Loading...', transparent = false }) => {
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${
      transparent ? 'bg-black bg-opacity-25' : 'bg-white bg-opacity-75'
    }`}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">{message}</p>
      </div>
    </div>
  );
};

export const LoadingSpinner = ({ size = 'default', className = '' }) => {
  const sizeClasses = {
    small: 'h-4 w-4',
    default: 'h-6 w-6',
    large: 'h-8 w-8'
  };

  return (
    <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeClasses[size]} ${className}`}></div>
  );
};

export const LoadingButton = ({ loading, children, disabled, ...props }) => {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${props.className} ${
        loading ? 'cursor-not-allowed opacity-75' : ''
      }`}
    >
      {loading ? (
        <div className="flex items-center justify-center">
          <LoadingSpinner size="small" className="mr-2" />
          {typeof children === 'string' ? 'Loading...' : children}
        </div>
      ) : (
        children
      )}
    </button>
  );
};

export default Loading;