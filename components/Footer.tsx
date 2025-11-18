'use client';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="border-t border-gray-200 pt-6 text-center">
          <p className="text-sm text-gray-600">
            &copy; {new Date().getFullYear()} Anton Merkurov. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
