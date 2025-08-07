import React, { useState } from 'react';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { useAuth } from '../contexts/AuthContext';
import { authenticatedRequest } from '../utils/api';
import { LoadingButton } from './Loading';
import {
  CreditCardIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

const PaymentForm = ({ selectedPlan, onSuccess, onError }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [cardError, setCardError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    const cardElement = elements.getElement(CardElement);
    setProcessing(true);
    setError(null);
    setCardError(null);

    try {
      // Create payment method
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
        },
      });

      if (stripeError) {
        setCardError(stripeError.message);
        setProcessing(false);
        return;
      }

      // Create subscription
      const response = await authenticatedRequest('/payments/create-subscription', {
        method: 'POST',
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
          priceId: selectedPlan,
        }),
      });

      if (response.requiresAction) {
        // Handle 3D Secure authentication
        const { error: confirmError } = await stripe.confirmCardPayment(
          response.clientSecret
        );

        if (confirmError) {
          setError(confirmError.message);
        } else {
          onSuccess(response);
        }
      } else {
        onSuccess(response);
      }
    } catch (err) {
      setError(err.message || 'Payment failed. Please try again.');
      if (onError) {
        onError(err);
      }
    } finally {
      setProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      invalid: {
        color: '#9e2146',
      },
    },
    hidePostalCode: false,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Payment Information
        </h3>
        
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center">
            <CreditCardIcon className="h-5 w-5 text-gray-400 mr-2" />
            <span className="text-sm font-medium text-gray-900">
              Credit or Debit Card
            </span>
          </div>
          <div className="mt-3 p-3 bg-white border border-gray-300 rounded-md">
            <CardElement 
              options={cardElementOptions}
              onChange={(event) => {
                if (event.error) {
                  setCardError(event.error.message);
                } else {
                  setCardError(null);
                }
              }}
            />
          </div>
          {cardError && (
            <p className="mt-2 text-sm text-red-600">{cardError}</p>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <div className="flex">
            <CheckCircleIcon className="h-5 w-5 text-blue-400 mt-0.5" />
            <div className="ml-3">
              <h4 className="text-sm font-medium text-blue-800">
                Secure Payment Processing
              </h4>
              <p className="text-sm text-blue-700 mt-1">
                Your payment information is encrypted and processed securely by Stripe. 
                We never store your credit card details.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">
          Payment Summary
        </h4>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Plan:</span>
          <span className="font-medium text-gray-900">
            {selectedPlan?.charAt(0).toUpperCase() + selectedPlan?.slice(1)} Plan
          </span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-gray-600">Billing:</span>
          <span className="font-medium text-gray-900">Monthly</span>
        </div>
        <div className="border-t border-gray-200 mt-2 pt-2">
          <div className="flex justify-between">
            <span className="text-base font-medium text-gray-900">Total:</span>
            <span className="text-base font-medium text-gray-900">
              ${selectedPlan === 'starter' ? '29' : selectedPlan === 'professional' ? '99' : '299'}/month
            </span>
          </div>
        </div>
      </div>

      <LoadingButton
        type="submit"
        loading={processing}
        disabled={!stripe || processing}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? 'Processing Payment...' : 'Subscribe Now'}
      </LoadingButton>

      <p className="text-xs text-gray-500 text-center">
        By subscribing, you agree to our Terms of Service and Privacy Policy. 
        You can cancel your subscription at any time.
      </p>
    </form>
  );
};

export default PaymentForm;