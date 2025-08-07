import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authenticatedRequest, downloadFile } from '../utils/api';
import { LoadingSpinner } from '../components/Loading';
import {
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  EyeIcon,
  CalendarDaysIcon,
  FolderIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

const DownloadPage = () => {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('job');
  
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCompletedJobs();
  }, []);

  useEffect(() => {
    if (jobId && jobs.length > 0) {
      const job = jobs.find(j => j.id === jobId);
      if (job) {
        setSelectedJob(job);
        fetchJobResults(job.id);
      }
    }
  }, [jobId, jobs]);

  const fetchCompletedJobs = async () => {
    try {
      setLoading(true);
      const response = await authenticatedRequest('/jobs?status=completed');
      setJobs(response.jobs || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch completed jobs:', err);
      setError('Failed to load completed jobs');
    } finally {
      setLoading(false);
    }
  };

  const fetchJobResults = async (jobId) => {
    try {
      const response = await authenticatedRequest(`/jobs/${jobId}/results`);
      setResults(response);
    } catch (err) {
      console.error('Failed to fetch job results:', err);
      setResults(null);
    }
  };

  const handleDownload = async (jobId, filename) => {
    try {
      setDownloading(true);
      await downloadFile(`/jobs/${jobId}/download`, filename);
    } catch (err) {
      console.error('Download failed:', err);
      setError('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleJobSelect = (job) => {
    setSelectedJob(job);
    fetchJobResults(job.id);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const calculateCompletionRate = (processed, total) => {
    if (!total) return 0;
    return Math.round((processed / total) * 100);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Download Results</h1>
        <div className="text-sm text-gray-500">
          {jobs.length} completed job{jobs.length !== 1 ? 's' : ''} available
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completed Jobs List */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Completed Jobs
            </h3>
            
            {jobs.length === 0 ? (
              <div className="text-center py-6">
                <FolderIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No completed jobs</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Upload and process lead files to see results here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      selectedJob?.id === job.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleJobSelect(job)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(job.status)}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {job.filename}
                          </p>
                          <p className="text-xs text-gray-500">
                            {job.totalLeads} leads • Completed {formatDate(job.completedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">
                          {calculateCompletionRate(job.processedLeads, job.totalLeads)}% success
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(job.id, `enriched_${job.filename}`);
                          }}
                          disabled={downloading}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        >
                          <DocumentArrowDownIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Quick Stats */}
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {job.processedLeads || 0} of {job.totalLeads} processed
                      </span>
                      <span>
                        {job.results?.fileSize ? formatFileSize(job.results.fileSize) : 'N/A'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Job Results Details */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              {selectedJob ? 'Results Summary' : 'Select a Job'}
            </h3>
            
            {selectedJob ? (
              <div className="space-y-6">
                {/* Job Overview */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Job Overview</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Total Leads
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedJob.totalLeads}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Processed
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedJob.processedLeads || 0}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Success Rate
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {calculateCompletionRate(selectedJob.processedLeads, selectedJob.totalLeads)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Completed
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {formatDate(selectedJob.completedAt)}
                      </dd>
                    </div>
                  </div>
                </div>

                {/* OSINT Data Summary */}
                {results && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">OSINT Data Summary</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                          WHOIS Data
                        </div>
                        <div className="text-lg font-semibold text-blue-900">
                          {results.osintStats?.whois || 0}
                        </div>
                        <div className="text-xs text-blue-700">records enriched</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-green-600 uppercase tracking-wide">
                          SSL Certificates
                        </div>
                        <div className="text-lg font-semibold text-green-900">
                          {results.osintStats?.ssl || 0}
                        </div>
                        <div className="text-xs text-green-700">certificates found</div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-purple-600 uppercase tracking-wide">
                          DNS Records
                        </div>
                        <div className="text-lg font-semibold text-purple-900">
                          {results.osintStats?.dns || 0}
                        </div>
                        <div className="text-xs text-purple-700">records retrieved</div>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-yellow-600 uppercase tracking-wide">
                          Tech Stack
                        </div>
                        <div className="text-lg font-semibold text-yellow-900">
                          {results.osintStats?.techStack || 0}
                        </div>
                        <div className="text-xs text-yellow-700">technologies detected</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* File Information */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Download Information</h4>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <DocumentArrowDownIcon className="h-8 w-8 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            enriched_{selectedJob.filename}
                          </p>
                          <p className="text-xs text-gray-500">
                            Excel file with OSINT enrichment data
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {results?.fileSize ? formatFileSize(results.fileSize) : 'N/A'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {results?.columns || 'Multiple'} columns
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Data Columns */}
                {results?.newColumns && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      New Data Columns Added
                    </h4>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex flex-wrap gap-2">
                        {results.newColumns.map((column, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {column}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Download Actions */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => handleDownload(selectedJob.id, `enriched_${selectedJob.filename}`)}
                    disabled={downloading}
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloading ? (
                      <>
                        <LoadingSpinner size="small" className="mr-2" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                        Download Results
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => fetchJobResults(selectedJob.id)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <EyeIcon className="h-4 w-4 mr-2" />
                    Refresh
                  </button>
                </div>

                {/* Processing Notes */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <EyeIcon className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-blue-800">
                        What's included in your download?
                      </h4>
                      <div className="mt-2 text-sm text-blue-700">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Original lead data with all existing columns</li>
                          <li>WHOIS information (registrar, creation date, expiry)</li>
                          <li>SSL certificate details and trust scores</li>
                          <li>DNS records and domain health metrics</li>
                          <li>Technology stack and framework detection</li>
                          <li>Business intelligence and risk assessment</li>
                          <li>Calculated lead scoring and qualification metrics</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <CalendarDaysIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No job selected</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Select a completed job from the list to view its results and download the enriched data.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadPage;