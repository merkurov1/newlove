import { metadata as rootMetadata } from '@/app/layout';

export const metadata = {
  title: {
    default: 'Admin — ' + (rootMetadata?.title?.default || 'Site'),
    template: '%s | Admin',
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Keep admin layout minimal but ensure it provides a container and spacing
  // consistent with the root layout so pages don't jump styling-wise.
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  );
}
