import Link from 'next/link';

export default function SignIn() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-xl p-8 flex flex-col items-center">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">Вход в аккаунт</h1>
        <Link
          href="/api/auth/google"
          className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-lg shadow transition text-lg"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
            <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
            <g id="SVGRepo_iconCarrier">
              <path d="M21.805 10.023h-9.765v3.977h5.617c-.242 1.242-1.242 3.648-5.617 3.648-3.375 0-6.125-2.789-6.125-6.148 0-3.359 2.75-6.148 6.125-6.148 1.922 0 3.211.82 3.953 1.523l2.703-2.625c-1.703-1.57-3.898-2.523-6.656-2.523-5.523 0-10 4.477-10 10s4.477 10 10 10c5.742 0 9.547-4.016 9.547-9.664 0-.648-.07-1.141-.156-1.523z" fill="#4285F4"></path>
              <path d="M3.545 7.345l3.289 2.414c.891-1.781 2.578-2.914 4.461-2.914 1.086 0 2.086.375 2.867 1.086l2.703-2.625c-1.703-1.57-3.898-2.523-6.656-2.523-3.789 0-7.008 2.484-8.242 5.922z" fill="#34A853"></path>
              <path d="M12 22c2.672 0 4.922-.883 6.563-2.406l-3.047-2.492c-.844.594-2.016 1.008-3.516 1.008-2.734 0-5.055-1.844-5.883-4.344l-3.242 2.5c1.219 3.406 4.453 5.734 9.125 5.734z" fill="#FBBC05"></path>
              <path d="M21.805 10.023h-9.765v3.977h5.617c-.242 1.242-1.242 3.648-5.617 3.648-3.375 0-6.125-2.789-6.125-6.148 0-3.359 2.75-6.148 6.125-6.148 1.922 0 3.211.82 3.953 1.523l2.703-2.625c-1.703-1.57-3.898-2.523-6.656-2.523-5.523 0-10 4.477-10 10s4.477 10 10 10c5.742 0 9.547-4.016 9.547-9.664 0-.648-.07-1.141-.156-1.523z" fill="none"></path>
            </g>
          </svg>
          Войти через Google
        </Link>
      </div>
    </div>
  );
}
