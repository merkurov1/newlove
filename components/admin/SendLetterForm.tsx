"use client";

import { useState, ChangeEvent } from 'react';
import { sendLetter } from '@/app/admin/actions';
import NewsletterJobStatus from './NewsletterJobStatus';

export default function SendLetterForm({ letter }: { letter: any }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);

  async function handleSendLetter(formData: FormData) {
    if (isLoading) {
      console.warn('Delivery is already in progress.');
      return;
    }
    
    setIsLoading(true);
    setMessage('');
    setJobId(null);
    try {
      if (testEmail) formData.set('testEmail', testEmail);
      const result = await sendLetter(null, formData);
      if (result?.status === 'success') {
        setMessage(`✓ ${result.message}`);
        if (result.jobId) {
          setJobId(result.jobId);
        }
      } else {
        setMessage(`✕ ${result?.message || 'Delivery failed.'}`);
      }
    } catch (error) {
      setMessage('✕ Delivery failed.');
    } finally {
      setIsLoading(false);
    }
  }

  if (letter?.sentAt) {
    return (
      <div className="font-mono text-xs text-neutral-900 py-2 flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 bg-neutral-900" />
        Sent: {new Date(letter.sentAt).toLocaleString('en-US')}
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="border-l-2 border-neutral-900 bg-neutral-50 p-4 font-mono text-xs text-neutral-800 space-y-1">
        <span className="font-bold uppercase tracking-wider block mb-1">Publication ≠ Delivery</span>
        <p>• Publication makes the letter visible in the public archive.</p>
        <p>• Delivery sends the letter to active subscribers.</p>
      </div>

      <p className="font-serif text-sm text-neutral-700 italic">
        The letter is ready for distribution. Review the content before launching.
      </p>

      {message && !jobId && (
        <div className="border border-neutral-200 bg-white p-4 font-mono text-xs text-neutral-900">
          {message}
        </div>
      )}

      {jobId && (
        <div>
          <NewsletterJobStatus jobId={jobId} onComplete={() => {
            window.location.reload();
          }} />
        </div>
      )}

      <form action={handleSendLetter} className="space-y-4">
        <input type="hidden" name="letterId" value={letter.id} />

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            name="testEmail"
            value={testEmail}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTestEmail(e.target.value)}
            placeholder="Test email (optional)"
            className="flex-1 bg-neutral-50/50 border border-neutral-200 px-4 py-3 font-mono text-xs text-neutral-900 focus:bg-white focus:border-neutral-900 focus:outline-none transition rounded-none"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="bg-neutral-900 hover:bg-black text-white font-mono text-xs uppercase tracking-widest px-6 py-3 transition-all rounded-none disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[200px]"
          >
            {isLoading ? (
              <>
                <div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-none" />
                <span>Sending...</span>
              </>
            ) : (
              <span>{testEmail ? 'Send Test' : 'Send Letter'}</span>
            )}
          </button>
        </div>
      </form>

      <div className="border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs text-neutral-500 space-y-2">
        <p className="font-bold uppercase tracking-wider text-neutral-700">Delivery protocol:</p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li>Cancellation is not available after launch.</li>
          <li>Recipients: active subscribers only (<code className="text-neutral-900">isActive=true</code>).</li>
          <li>Unconfirmed addresses are excluded automatically.</li>
          <li>Duplicate delivery is blocked at the database level.</li>
        </ul>
      </div>
    </div>
  );
}
