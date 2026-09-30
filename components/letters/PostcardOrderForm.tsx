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
  const { user, profile } = useAuth();

  // Безопасно извлекаем имя без обращения к несуществующим свойствам типа User
  const initialName = profile?.name || user?.user_metadata?.name || user?.email || '';

  const [formData, setFormData] = useState<FormData>({
    recipientName: initialName,
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
      <div>
        <label className="block text-sm font-medium text-gray-700">Recipient Name</label>
        <input
          type="text"
          name="recipientName"
          value={formData.recipientName}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Street Address</label>
        <input
          type="text"
          name="streetAddress"
          value={formData.streetAddress}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">City</label>
        <input
          type="text"
          name="city"
          value={formData.city}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Postal Code</label>
        <input
          type="text"
          name="postalCode"
          value={formData.postalCode}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Country</label>
        <input
          type="text"
          name="country"
          value={formData.country}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Custom Message</label>
        <textarea
          name="customMessage"
          value={formData.customMessage}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
        />
      </div>

      <div className="flex justify-between items-center pt-4">
        <button type="button" onClick={onBack} className="px-4 py-2 bg-gray-200 rounded">
          Back
        </button>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">
          {loading ? 'Ordering...' : `Order for ${formatPrice(postcard.price)}`}
        </button>
      </div>

      {error && <div className="text-red-600 mt-2 text-sm">{error}</div>}
    </form>
  );
}
