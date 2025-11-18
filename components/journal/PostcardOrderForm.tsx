'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import Image from 'next/image';

interface Postcard {
  id: string;
  title: string;
  description: string;
  image: string;
  price: number;
  available: boolean;
  featured: boolean;
}

interface PostcardOrderFormProps {
  postcard: Postcard;
  onBack: () => void;
}

interface FormData {
  recipientName: string;
  streetAddress: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  phone: string;
  customMessage: string;
}

export default function PostcardOrderForm({ postcard, onBack }: PostcardOrderFormProps) {
  const { session } = useAuth();
  const [formData, setFormData] = useState<FormData>({
    recipientName: session?.user?.name || '',
    streetAddress: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: 'United Kingdom',
    phone: '',
    customMessage: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (priceInPence: number) => {
    return `₽${(priceInPence / 100).toFixed(0)}`;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const required = ['recipientName', 'streetAddress', 'city', 'postalCode', 'country'];
    for (const field of required) {
      if (!formData[field as keyof FormData].trim()) {
        setError(`Field "${getFieldLabel(field)}" is required`);
        return false;
      }
    }
    return true;
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      recipientName: 'Recipient Name',
      streetAddress: 'Address',
      city: 'City',
      stateProvince: 'Region/State',
      postalCode: 'Postal Code',
      country: 'Country',
    };
    return labels[field] || field;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/postcards/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postcardId: postcard.id,
          ...formData,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error creating order');
      }
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        setError('Error creating payment link');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ...form fields and UI... */}
      <button type="button" onClick={onBack} className="mr-4 px-4 py-2 bg-gray-200 rounded">
        Back
      </button>
      <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">
        {loading ? 'Ordering...' : 'Order'}
      </button>
      {error && <div className="text-red-600 mt-2">{error}</div>}
    </form>
  );
}
