import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiService from '../services/apiService';
import toast from 'react-hot-toast';
import {
  CreditCardIcon,
  CheckIcon,
  XMarkIcon,
  ArrowRightIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    credits: 1000,
    features: [
      '1,000 lead credits per month',
      'Basic OSINT data sources',
      'Excel/CSV export',
      'Email support',
      '7-day data retention'
    ],
    notIncluded: [
      'Advanced data sources',
      'API access',
      'Custom scoring models',
      'Priority support'
    ]
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 149,
    credits: 5000,
    popular: true,
    features: [
      '5,000 lead credits per month',
      'All OSINT data sources',
      'Excel/CSV/JSON export',
      'API access (1000 req/day)',
      '30-day data retention',
      'Custom scoring models',
      'Priority email support'
    ],
    notIncluded: [
      'Dedicated account manager',
      'Custom integrations'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 499,
    credits: 20000,
    features: [
      '20,000 lead credits per month',
      'All OSINT data sources',
      'All export formats',
      'Unlimited API access',
      'Unlimited data retention',
      'Custom scoring models',
      'Dedicated account manager',
      'Custom integrations',
      '24/7 phone support',
      'SLA guarantee'
    ],
    notIncluded: []
  }
];

const BillingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentPlan, setCurrentPlan] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [changingPlan, setChangingPlan] = useState(null);

  useEffect(() => {
    fetchBillingInfo();
  }, []);

  const fetchBillingInfo = async () => {
    try {
      const [subscriptionRes, usageRes] = await Promise.all([
        apiService.get('/api/subscriptions/current'),
        apiService.get('/api/subscriptions/usage')
      ]);
      
      setCurrentPlan(subscriptionRes.data.subscription);
      setUsage(usageRes.data);
    } catch (error) {
      console.error('Error fetching billing info:', error);
      toast.error('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (planId) => {
    if (planId === currentPlan?.plan_id) {
      return;
    }
    
    setChangingPlan(planId);
    
    try {
      const response = await apiService.post('/api/subscriptions/change-plan', {
        plan_id: planId
      });
      
      if (response.data.success) {
        toast.success('Plan changed successfully!');
        await fetchBillingInfo();
        
        // If upgrading, redirect to payment if needed
        if (response.data.payment_required) {
          navigate('/payment', { state: { planId } });
        }
      }
    } catch (error) {
      console.error('Error changing plan:', error);
      toast.error(error.response?.data?.error || 'Failed to change plan');
    } finally {
      setChangingPlan(null);
    }
  };

  const handleManagePayment = () => {
    navigate('/payment', { state: { action: 'update' } });
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getUsagePercentage = () => {
    if (!usage || !currentPlan) return 0;
    return Math.round((usage.credits_used / currentPlan.credits_limit) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Billing & Subscription
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Manage your subscription and view usage
          </p>
        </div>

        {/* Current Plan & Usage */}
        {currentPlan && (
          <div className="mt-12 bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Current Plan</h3>
                <div className="mt-1 flex items-center">
                  <span className="text-2xl font-bold text-indigo-600">
                    {currentPlan.plan_name}
                  </span>
                  <span className="ml-2 text-gray-500">
                    ${currentPlan.price}/month
                  </span>
                </div>
              </div>
              <button
                onClick={handleManagePayment}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <CreditCardIcon className="h-5 w-5 mr-2 text-gray-400" />
                Manage Payment Method
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Usage */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Monthly Credits Usage
                </h4>
                <div className="relative">
                  <div className="overflow-hidden h-4 text-xs flex rounded bg-gray-200">
                    <div
                      style={{ width: `${getUsagePercentage()}%` }}
                      className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${
                        getUsagePercentage() > 80 ? 'bg-red-500' : 'bg-indigo-600'
                      }`}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-sm text-gray-600">
                    <span>{usage?.credits_used || 0} used</span>
                    <span>{currentPlan.credits_limit} total</span>
                  </div>
                </div>
              </div>

              {/* Billing Cycle */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Billing Cycle
                </h4>
                <p className="text-sm text-gray-600">
                  Current period: {formatDate(usage?.period_start)} - {formatDate(usage?.period_end)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Next billing date: {formatDate(usage?.period_end)}
                </p>
              </div>
            </div>

            {/* Usage Warning */}
            {getUsagePercentage() > 80 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  <strong>Warning:</strong> You've used {getUsagePercentage()}% of your monthly credits.
                  Consider upgrading your plan to avoid service interruption.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Pricing Plans */}
        <div className="mt-16">
          <h3 className="text-2xl font-bold text-gray-900 text-center mb-12">
            Available Plans
          </h3>
          
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrentPlan = currentPlan?.plan_id === plan.id;
              const isUpgrade = currentPlan && plans.findIndex(p => p.id === currentPlan.plan_id) < plans.findIndex(p => p.id === plan.id);
              
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-lg shadow-md ${
                    plan.popular ? 'border-2 border-indigo-600' : 'border border-gray-200'
                  } bg-white`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-medium bg-indigo-600 text-white">
                        <SparklesIcon className="h-4 w-4 mr-1" />
                        Most Popular
                      </span>
                    </div>
                  )}
                  
                  <div className="p-6">
                    <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
                    <div className="mt-4 flex items-baseline">
                      <span className="text-4xl font-extrabold text-gray-900">${plan.price}</span>
                      <span className="ml-1 text-gray-500">/month</span>
                    </div>
                    
                    <ul className="mt-6 space-y-4">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <CheckIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
                          <span className="ml-3 text-sm text-gray-700">{feature}</span>
                        </li>
                      ))}
                      {plan.notIncluded.map((feature, index) => (
                        <li key={`not-${index}`} className="flex items-start opacity-50">
                          <XMarkIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          <span className="ml-3 text-sm text-gray-500">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <div className="mt-8">
                      {isCurrentPlan ? (
                        <button
                          disabled
                          className="w-full py-3 px-4 rounded-md text-sm font-medium text-gray-500 bg-gray-100 cursor-not-allowed"
                        >
                          Current Plan
                        </button>
                      ) : (
                        <button
                          onClick={() => handleChangePlan(plan.id)}
                          disabled={changingPlan === plan.id}
                          className={`w-full py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                            plan.popular
                              ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                              : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                          } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {changingPlan === plan.id ? (
                            <span className="flex items-center justify-center">
                              <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Processing...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center">
                              {isUpgrade ? 'Upgrade' : 'Select'} Plan
                              <ArrowRightIcon className="h-4 w-4 ml-2" />
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-16 text-center">
          <p className="text-gray-600">
            All plans include a 14-day free trial. No credit card required to start.
          </p>
          <p className="mt-2 text-gray-600">
            Need more credits or custom features?{' '}
            <a href="#" className="text-indigo-600 hover:text-indigo-500 font-medium">
              Contact our sales team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;