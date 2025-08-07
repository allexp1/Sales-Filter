import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { useAuth } from '../contexts/AuthContext';
import apiService from '../services/apiService';
import toast from 'react-hot-toast';
import {
  CreditCardIcon,
  LockClosedIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

// Initialize Stripe
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#32325d',
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: 'antialiased',
      fontSize: '16px',
      '::placeholder': {
        color: '#aab7c4'
      }
    },
    invalid: {
      color: '#fa755a',
      iconColor: '#fa755a'
    }
  }
};

const CheckoutForm = ({ planId, action }) => {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [processing, setProcessing] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState(null);
  const [billingDetails, setBillingDetails] = useState({
    name: '',
    email: user?.email || '',
    address: {
      line1: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'US'
    }
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name.startsWith('address.')) {
      const addressField = name.split('.')[1];
      setBillingDetails(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }));
    } else {
      setBillingDetails(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Create or update payment method
      const card = elements.getElement(CardElement);
      
      if (action === 'update') {
        // Update payment method
        const { error: methodError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card,
          billing_details: billingDetails
        });

        if (methodError) {
          setError(methodError.message);
          setProcessing(false);
          return;
        }

        const response = await apiService.post('/api/payments/update-method', {
          payment_method_id: paymentMethod.id
        });

        if (response.data.success) {
          setSucceeded(true);
          toast.success('Payment method updated successfully!');
          setTimeout(() => navigate('/billing'), 2000);
        }
      } else {
        // Process subscription payment
        const response = await apiService.post('/api/payments/create-subscription', {
          plan_id: planId
        });

        const { client_secret } = response.data;

        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
          client_secret,
          {
            payment_method: {
              card,
              billing_details: billingDetails
            }
          }
        );

        if (confirmError) {
          setError(confirmError.message);
          setProcessing(false);
          return;
        }

        if (paymentIntent.status === 'succeeded') {
          setSucceeded(true);
          toast.success('Subscription activated successfully!');
          setTimeout(() => navigate('/dashboard'), 2000);
        }
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Billing Information */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Billing Information</h3>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Cardholder Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={billingDetails.name}
              onChange={handleInputChange}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="John Doe"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={billingDetails.email}
              onChange={handleInputChange}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="address.line1" className="block text-sm font-medium text-gray-700">
              Address
            </label>
            <input
              type="text"
              id="address.line1"
              name="address.line1"
              required
              value={billingDetails.address.line1}
              onChange={handleInputChange}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="123 Main St"
            />
          </div>

          <div>
            <label htmlFor="address.city" className="block text-sm font-medium text-gray-700">
              City
            </label>
            <input
              type="text"
              id="address.city"
              name="address.city"
              required
              value={billingDetails.address.city}
              onChange={handleInputChange}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="address.state" className="block text-sm font-medium text-gray-700">
              State
            </label>
            <input
              type="text"
              id="address.state"
              name="address.state"
              required
              value={billingDetails.address.state}
              onChange={handleInputChange}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="NY"
            />
          </div>

          <div>
            <label htmlFor="address.postal_code" className="block text-sm font-medium text-gray-700">
              Postal Code
            </label>
            <input
              type="text"
              id="address.postal_code"
              name="address.postal_code"
              required
              value={billingDetails.address.postal_code}
              onChange={handleInputChange}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="10001"
            />
          </div>

          <div>
            <label htmlFor="address.country" className="block text-sm font-medium text-gray-700">
              Country
            </label>
            <select
              id="address.country"
              name="address.country"
              required
              value={billingDetails.address.country}
              onChange={handleInputChange}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="GB">United Kingdom</option>
              <option value="AU">Australia</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="JP">Japan</option>
            </select>
          </div>
        </div>
      </div>

      {/* Card Information */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Method</h3>
        
        <div className="border border-gray-300 rounded-md p-4">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        
        <div className="mt-2 flex items-center text-sm text-gray-500">
          <LockClosedIcon className="h-4 w-4 mr-1" />
          Your payment information is encrypted and secure
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Success message */}
      {succeeded && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="flex">
            <CheckCircleIcon className="h-5 w-5 text-green-400" />
            <p className="ml-3 text-sm text-green-800">
              Payment successful! Redirecting...
            </p>
          </div>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={!stripe || processing || succeeded}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? (
          <span className="flex items-center">
            <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
        ) : succeeded ? (
          'Success!'
        ) : (
          action === 'update' ? 'Update Payment Method' : 'Complete Subscription'
        )}
      </button>

      {/* Test card info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6 p-4 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-800 font-medium">Test Card Information:</p>
          <p className="text-sm text-blue-700 mt-1">Card Number: 4242 4242 4242 4242</p>
          <p className="text-sm text-blue-700">Expiry: Any future date</p>
          <p className="text-sm text-blue-700">CVC: Any 3 digits</p>
        </div>
      )}
    </form>
  );
};

const PaymentPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { planId, action } = location.state || {};
  const [planDetails, setPlanDetails] = useState(null);

  useEffect(() => {
    if (!planId && action !== 'update') {
      navigate('/billing');
      return;
    }

    if (planId) {
      // Fetch plan details
      fetchPlanDetails();
    }
  }, [planId, action, navigate]);

  const fetchPlanDetails = async () => {
    try {
      const response = await apiService.get(`/api/subscriptions/plans/${planId}`);
      setPlanDetails(response.data);
    } catch (error) {
      console.error('Error fetching plan details:', error);
      toast.error('Failed to load plan details');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md">
          <div className="px-6 py-8">
            <div className="flex items-center mb-8">
              <CreditCardIcon className="h-8 w-8 text-indigo-600 mr-3" />
              <h2 className="text-2xl font-bold text-gray-900">
                {action === 'update' ? 'Update Payment Method' : 'Complete Your Subscription'}
              </h2>
            </div>

            {planDetails && (
              <div className="mb-8 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900">
                  {planDetails.name} Plan
                </h3>
                <p className="text-2xl font-bold text-indigo-600 mt-1">
                  ${planDetails.price}/month
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  {planDetails.credits} credits per month
                </p>
              </div>
            )}

            <Elements stripe={stripePromise}>
              <CheckoutForm planId={planId} action={action} />
            </Elements>
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/billing')}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to Billing
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;