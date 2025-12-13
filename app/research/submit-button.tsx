'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton() {
  const { pending } = useFormStatus()
 
  return (
    <button 
      type="submit" 
      disabled={pending}
      className="w-full py-3 bg-red-900/20 border border-red-900 text-red-500 font-mono text-xs uppercase tracking-widest hover:bg-red-900 hover:text-white transition disabled:opacity-50"
    >
      {pending ? 'Transmitting...' : 'Request Access'}
    </button>
  )
}