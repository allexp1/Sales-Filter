import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingButton } from '../components/Loading';
import {
  CheckCircleIcon,
  DocumentArrowUpIcon,
  CreditCardIcon,
  RocketLaunchIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';

const WizardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [preferences, setPreferences] = useState({
    useCase: '',
    teamSize: '',
    industry: '',
    dataVolume: '',
    completedWelcome: false,
  });

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to OSINT Lead Scoring',
      subtitle: 'Let\'s get you started with your lead enrichment journey',
      component: WelcomeStep,
    },
    {
      id: 'usecase',
      title: 'What\'s your primary use case?',
      subtitle: 'Help us understand how you plan to use our platform',
      component: UseCaseStep,
    },
    {
      id: 'setup',
      title: 'Tell us about your team',
      subtitle: 'This helps us recommend the best plan for you',
      component: SetupStep,
    },
    {
      id: 'subscription',
      title: 'Choose your plan',
      subtitle: 'Select the plan that best fits your needs',
      component: SubscriptionStep,
    },
    {
      id: 'complete',
      title: 'You\'re all set!',
      subtitle: 'Ready to start enriching your leads with OSINT data',
      component: CompleteStep,
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    navigate('/dashboard');
  };

  const updatePreferences = (updates) => {
    setPreferences(prev => ({ ...prev, ...updates }));
  };

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">OSINT Lead Scoring</h1>
          <p className="mt-2 text-sm text-gray-600">
            Step {currentStep + 1} of {steps.length}
          </p>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-8">
          <div className="bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-gray-900">
              {steps[currentStep].title}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {steps[currentStep].subtitle}
            </p>
          </div>

          <CurrentStepComponent
            preferences={preferences}
            updatePreferences={updatePreferences}
            onNext={handleNext}
            onPrev={handlePrev}
            onComplete={handleComplete}
            user={user}
          />
        </div>
      </div>
    </div>
  );
};

const WelcomeStep = ({ onNext }) => (
  <div className="text-center">
    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-6">
      <SparklesIcon className="h-8 w-8 text-blue-600" />
    </div>
    <p className="text-gray-600 mb-8">
      Transform your sales process with powerful OSINT (Open Source Intelligence) 
      data enrichment. Get detailed insights about your leads including company 
      information, technology stack, security posture, and more.
    </p>
    <div className="grid grid-cols-2 gap-4 mb-8">
      <div className="text-center">
        <div className="bg-green-100 rounded-full h-12 w-12 flex items-center justify-center mx-auto mb-2">
          <ShieldCheckIcon className="h-6 w-6 text-green-600" />
        </div>
        <div className="text-sm font-medium text-gray-900">Security Intel</div>
        <div className="text-xs text-gray-500">SSL, WHOIS, DNS</div>
      </div>
      <div className="text-center">
        <div className="bg-purple-100 rounded-full h-12 w-12 flex items-center justify-center mx-auto mb-2">
          <ChartBarIcon className="h-6 w-6 text-purple-600" />
        </div>
        <div className="text-sm font-medium text-gray-900">Business Intel</div>
        <div className="text-xs text-gray-500">Tech stack, traffic</div>
      </div>
    </div>
    <button
      onClick={onNext}
      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
    >
      Get Started
      <ArrowRightIcon className="ml-2 h-4 w-4" />
    </button>
  </div>
);

const UseCaseStep = ({ preferences, updatePreferences, onNext, onPrev }) => {
  const useCases = [
    {
      id: 'sales',
      title: 'Sales & Lead Generation',
      description: 'Qualify leads and prioritize outreach efforts',
      icon: RocketLaunchIcon,
    },
    {
      id: 'security',
      title: 'Security Assessment',
      description: 'Analyze security posture of target companies',
      icon: ShieldCheckIcon,
    },
    {
      id: 'research',
      title: 'Market Research',
      description: 'Gather competitive intelligence and market insights',
      icon: GlobeAltIcon,
    },
    {
      id: 'compliance',
      title: 'Due Diligence',
      description: 'Verify company information for compliance',
      icon: CheckCircleIcon,
    },
  ];

  return (
    <div>
      <div className="space-y-3 mb-8">
        {useCases.map((useCase) => (
          <label
            key={useCase.id}
            className={`relative flex cursor-pointer rounded-lg border p-4 hover:bg-gray-50 ${
              preferences.useCase === useCase.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="useCase"
              value={useCase.id}
              checked={preferences.useCase === useCase.id}
              onChange={(e) => updatePreferences({ useCase: e.target.value })}
              className="sr-only"
            />
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <useCase.icon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">
                  {useCase.title}
                </div>
                <div className="text-sm text-gray-500">
                  {useCase.description}
                </div>
              </div>
            </div>
          </label>
        ))}
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!preferences.useCase}
          className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
          <ArrowRightIcon className="ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const SetupStep = ({ preferences, updatePreferences, onNext, onPrev }) => {
  const teamSizes = [
    { id: 'solo', label: 'Just me', description: 'Individual user' },
    { id: 'small', label: '2-10 people', description: 'Small team' },
    { id: 'medium', label: '11-50 people', description: 'Growing company' },
    { id: 'large', label: '50+ people', description: 'Enterprise' },
  ];

  const dataVolumes = [
    { id: 'low', label: '< 1,000 leads/month', description: 'Light usage' },
    { id: 'medium', label: '1,000-10,000 leads/month', description: 'Regular usage' },
    { id: 'high', label: '10,000+ leads/month', description: 'Heavy usage' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Team Size</h3>
        <div className="space-y-2">
          {teamSizes.map((size) => (
            <label key={size.id} className="flex items-center">
              <input
                type="radio"
                name="teamSize"
                value={size.id}
                checked={preferences.teamSize === size.id}
                onChange={(e) => updatePreferences({ teamSize: e.target.value })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">{size.label}</div>
                <div className="text-xs text-gray-500">{size.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Expected Data Volume</h3>
        <div className="space-y-2">
          {dataVolumes.map((volume) => (
            <label key={volume.id} className="flex items-center">
              <input
                type="radio"
                name="dataVolume"
                value={volume.id}
                checked={preferences.dataVolume === volume.id}
                onChange={(e) => updatePreferences({ dataVolume: e.target.value })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">{volume.label}</div>
                <div className="text-xs text-gray-500">{volume.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!preferences.teamSize || !preferences.dataVolume}
          className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
          <ArrowRightIcon className="ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const SubscriptionStep = ({ onNext, onPrev }) => {
  const navigate = useNavigate();

  const handleChoosePlan = (plan) => {
    navigate('/billing', { state: { selectedPlan: plan } });
  };

  return (
    <div>
      <div className="space-y-4 mb-8">
        <div className="border rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-medium text-gray-900">Starter Plan</h3>
            <span className="text-2xl font-bold text-gray-900">$29/mo</span>
          </div>
          <ul className="text-sm text-gray-600 space-y-1 mb-4">
            <li>• Up to 1,000 leads/month</li>
            <li>• Basic OSINT enrichment</li>
            <li>• Email support</li>
            <li>• Excel/CSV export</li>
          </ul>
          <button
            onClick={() => handleChoosePlan('starter')}
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Choose Starter
          </button>
        </div>

        <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-medium text-gray-900">Professional Plan</h3>
            <span className="text-2xl font-bold text-gray-900">$99/mo</span>
          </div>
          <ul className="text-sm text-gray-600 space-y-1 mb-4">
            <li>• Up to 10,000 leads/month</li>
            <li>• Advanced OSINT enrichment</li>
            <li>• Priority support</li>
            <li>• API access</li>
            <li>• Advanced analytics</li>
          </ul>
          <button
            onClick={() => handleChoosePlan('professional')}
            className="w-full px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Choose Professional
          </button>
        </div>
      </div>

      <div className="text-center mb-6">
        <button
          onClick={onNext}
          className="text-sm text-blue-600 hover:text-blue-500"
        >
          Skip for now, I'll choose later
        </button>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back
        </button>
      </div>
    </div>
  );
};

const CompleteStep = ({ onComplete }) => (
  <div className="text-center">
    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
      <CheckCircleIcon className="h-8 w-8 text-green-600" />
    </div>
    <p className="text-gray-600 mb-8">
      You're all set! Your account is ready and you can start uploading lead files 
      for OSINT enrichment. We'll help you get the most out of your data.
    </p>
    <div className="bg-blue-50 rounded-lg p-4 mb-8">
      <h3 className="text-sm font-medium text-blue-900 mb-2">Quick Start Tips:</h3>
      <ul className="text-sm text-blue-800 space-y-1">
        <li>• Upload Excel or CSV files with company websites</li>
        <li>• Monitor job progress in real-time</li>
        <li>• Download enriched data with OSINT insights</li>
        <li>• Use scoring metrics to prioritize leads</li>
      </ul>
    </div>
    <button
      onClick={onComplete}
      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
    >
      <RocketLaunchIcon className="mr-2 h-4 w-4" />
      Go to Dashboard
    </button>
  </div>
);

export default WizardPage;