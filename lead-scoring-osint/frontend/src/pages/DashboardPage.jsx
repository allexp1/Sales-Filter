import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import jobService from '../services/jobService';
import { formatDistanceToNow } from 'date-fns';
import {
  BriefcaseIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ChartBarIcon,
  ArrowRightIcon,
  CloudArrowUpIcon
} from '@heroicons/react/24/outline';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

const DashboardPage = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [jobsData, statsData, historyData] = await Promise.all([
        jobService.getJobs({ limit: 5 }),
        jobService.getJobStats(),
        jobService.getProcessingHistory(7)
      ]);

      setJobs(jobsData.jobs || []);
      setStats(statsData);
      setHistory(historyData.history || []);
    } catch (error) {
      toast.error('Failed to load dashboard data');
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <ClockIcon className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'processing':
        return 'text-blue-600 bg-blue-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome back, {user?.name || user?.email}!
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Here's an overview of your lead enrichment activities
              </p>
            </div>
            <Link
              to="/upload"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <CloudArrowUpIcon className="h-5 w-5 mr-2" />
              Upload New Leads
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Total Jobs</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.totalJobs || 0}</dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Leads Processed</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.totalLeadsProcessed || 0}</dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">High Score Leads</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.highScoreLeads || 0}</dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Success Rate</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {stats.successRate ? `${stats.successRate.toFixed(1)}%` : '0%'}
              </dd>
            </div>
          </div>
        </div>
      )}

      {/* Processing History Chart */}
      {history.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Processing History (7 days)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="leads" stroke="#4F46E5" name="Leads Processed" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Jobs */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Recent Jobs</h2>
          <Link
            to="/status"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 flex items-center"
          >
            View all jobs
            <ArrowRightIcon className="ml-1 h-4 w-4" />
          </Link>
        </div>
        <ul className="divide-y divide-gray-200">
          {jobs.length === 0 ? (
            <li className="px-4 py-8 text-center text-gray-500">
              No jobs yet. Upload your first leads file to get started!
            </li>
          ) : (
            jobs.map((job) => (
              <li key={job.id}>
                <Link to={`/status?jobId=${job.id}`} className="block hover:bg-gray-50 px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {getStatusIcon(job.status)}
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-900">
                          {job.original_filename || 'Unnamed file'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {job.total_leads} leads • {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                      {job.status === 'processing' && job.progress !== null && (
                        <div className="ml-4 w-32">
                          <div className="bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{job.progress}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/upload"
          className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-gray-400 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
        >
          <div className="flex-shrink-0">
            <DocumentTextIcon className="h-6 w-6 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="absolute inset-0" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-900">Upload Leads</p>
            <p className="text-sm text-gray-500 truncate">Process new lead files</p>
          </div>
        </Link>

        <Link
          to="/billing"
          className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-gray-400 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
        >
          <div className="flex-shrink-0">
            <BriefcaseIcon className="h-6 w-6 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="absolute inset-0" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-900">Manage Billing</p>
            <p className="text-sm text-gray-500 truncate">View and update subscription</p>
          </div>
        </Link>

        <Link
          to="/analytics"
          className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-gray-400 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
        >
          <div className="flex-shrink-0">
            <ChartBarIcon className="h-6 w-6 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="absolute inset-0" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-900">View Analytics</p>
            <p className="text-sm text-gray-500 truncate">Detailed insights and reports</p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default DashboardPage;