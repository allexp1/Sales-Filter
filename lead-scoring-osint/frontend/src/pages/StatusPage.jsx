import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import jobService from '../services/jobService';
import { useWebSocket } from '../services/websocketService';
import { formatDistanceToNow, format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  TrashIcon,
  InformationCircleIcon,
  SignalIcon
} from '@heroicons/react/24/outline';

const StatusPage = () => {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // WebSocket connection for real-time updates
  const { status: wsStatus, updates, isConnected } = useWebSocket(jobId, token);

  useEffect(() => {
    if (jobId) {
      loadJobDetails();
    }
  }, [jobId]);

  useEffect(() => {
    // Update job state with WebSocket status
    if (wsStatus) {
      setJob(prev => ({
        ...prev,
        ...wsStatus
      }));
    }
  }, [wsStatus]);

  useEffect(() => {
    // Process WebSocket updates
    updates.forEach(update => {
      if (update.type === 'log') {
        setLogs(prev => [...prev, update.log]);
      }
    });
  }, [updates]);

  const loadJobDetails = async () => {
    try {
      setLoading(true);
      const [jobData, logsData] = await Promise.all([
        jobService.getJob(jobId),
        jobService.getJobLogs(jobId)
      ]);
      
      setJob(jobData);
      setLogs(logsData.logs || []);
    } catch (error) {
      toast.error('Failed to load job details');
      console.error('Load job error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      await jobService.downloadResults(jobId);
      toast.success('Download started');
    } catch (error) {
      toast.error('Failed to download results');
      console.error('Download error:', error);
    }
  };

  const handleRetry = async () => {
    try {
      const result = await jobService.retryJob(jobId);
      toast.success('Job restarted successfully');
      loadJobDetails();
    } catch (error) {
      toast.error('Failed to retry job');
      console.error('Retry error:', error);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this job?')) return;
    
    try {
      await jobService.cancelJob(jobId);
      toast.success('Job cancelled');
      loadJobDetails();
    } catch (error) {
      toast.error('Failed to cancel job');
      console.error('Cancel error:', error);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-8 w-8 text-green-500" />;
      case 'processing':
        return <ClockIcon className="h-8 w-8 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircleIcon className="h-8 w-8 text-red-500" />;
      default:
        return <ClockIcon className="h-8 w-8 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'text-green-900 bg-green-100';
      case 'processing':
        return 'text-blue-900 bg-blue-100';
      case 'failed':
        return 'text-red-900 bg-red-100';
      default:
        return 'text-gray-900 bg-gray-100';
    }
  };

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'error':
        return 'text-red-600';
      case 'warn':
        return 'text-yellow-600';
      case 'info':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Job not found</h2>
        <p className="mt-2 text-gray-600">The requested job could not be found.</p>
        <Link
          to="/dashboard"
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Job Header */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {getStatusIcon(job.status)}
              <div className="ml-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  {job.original_filename || 'Lead Processing Job'}
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  Job ID: {job.id}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {/* WebSocket Connection Status */}
              <div className="flex items-center">
                <SignalIcon className={`h-5 w-5 ${isConnected ? 'text-green-500' : 'text-gray-400'}`} />
                <span className={`ml-1 text-sm ${isConnected ? 'text-green-600' : 'text-gray-500'}`}>
                  {isConnected ? 'Live' : 'Offline'}
                </span>
              </div>
              
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(job.status)}`}>
                {job.status}
              </span>
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        {job.status === 'processing' && job.progress !== null && (
          <div className="px-4 pb-4 sm:px-6">
            <div className="bg-gray-200 rounded-full h-4 relative">
              <div
                className="bg-indigo-600 h-4 rounded-full transition-all duration-300"
                style={{ width: `${job.progress}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-900">
                {job.progress}%
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Processing {job.processed_leads || 0} of {job.total_leads || 0} leads
            </p>
          </div>
        )}
        
        {/* Job Details */}
        <div className="border-t border-gray-200">
          <dl>
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {format(new Date(job.created_at), 'PPpp')}
                <span className="text-gray-500 ml-2">
                  ({formatDistanceToNow(new Date(job.created_at), { addSuffix: true })})
                </span>
              </dd>
            </div>
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Total Leads</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {job.total_leads || 0}
              </dd>
            </div>
            {job.status === 'completed' && (
              <>
                <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500">Enriched Leads</dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    {job.enriched_leads || 0}
                  </dd>
                </div>
                <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500">High Score Leads (≥70)</dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    {job.high_score_leads || 0}
                  </dd>
                </div>
              </>
            )}
            {job.error_message && (
              <div className="bg-red-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-red-800">Error</dt>
                <dd className="mt-1 text-sm text-red-900 sm:mt-0 sm:col-span-2">
                  {job.error_message}
                </dd>
              </div>
            )}
          </dl>
        </div>
        
        {/* Action Buttons */}
        <div className="bg-gray-50 px-4 py-3 sm:px-6 flex justify-end space-x-3">
          {job.status === 'completed' && job.results_filename && (
            <button
              onClick={handleDownload}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
              Download Results
            </button>
          )}
          {job.status === 'failed' && (
            <button
              onClick={handleRetry}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <ArrowPathIcon className="h-5 w-5 mr-2" />
              Retry Job
            </button>
          )}
          {job.status === 'processing' && (
            <button
              onClick={handleCancel}
              className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <XCircleIcon className="h-5 w-5 mr-2" />
              Cancel Job
            </button>
          )}
        </div>
      </div>

      {/* Processing Logs */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Processing Logs
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Real-time logs from the OSINT enrichment process
          </p>
        </div>
        <div className="border-t border-gray-200">
          <div className="max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <InformationCircleIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                No logs available yet
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {logs.map((log, index) => (
                  <li key={index} className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-start space-x-3">
                      <span className={`text-xs font-medium uppercase ${getLogLevelColor(log.level)}`}>
                        [{log.level}]
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{log.message}</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusPage;