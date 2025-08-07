import React from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console in development
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Update state with error details
    this.setState({
      error,
      errorInfo
    });

    // In production, you might want to send this to an error tracking service
    if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_SENTRY_DSN) {
      // window.Sentry?.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Optionally reload the page
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.href = '/';
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-lg w-full">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
              </div>
              
              <div className="mt-4 text-center">
                <h1 className="text-lg font-semibold text-gray-900">
                  Oops! Something went wrong
                </h1>
                
                <p className="mt-2 text-sm text-gray-600">
                  We're sorry for the inconvenience. An unexpected error has occurred.
                </p>

                {/* Show error details in development */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <div className="mt-4 text-left">
                    <details className="bg-gray-100 rounded p-4">
                      <summary className="cursor-pointer font-medium text-sm text-gray-700">
                        Error Details (Development Only)
                      </summary>
                      <div className="mt-2 space-y-2">
                        <div>
                          <p className="text-xs font-medium text-gray-600">Error:</p>
                          <pre className="text-xs text-red-600 overflow-x-auto">
                            {this.state.error.toString()}
                          </pre>
                        </div>
                        {this.state.errorInfo && (
                          <div>
                            <p className="text-xs font-medium text-gray-600">Component Stack:</p>
                            <pre className="text-xs text-gray-700 overflow-x-auto">
                              {this.state.errorInfo.componentStack}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}

                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={this.handleReset}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Go to Dashboard
                  </button>
                  
                  <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Reload Page
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">
                If this problem persists, please{' '}
                <a href="mailto:support@leadscorer.com" className="text-indigo-600 hover:text-indigo-500">
                  contact support
                </a>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;