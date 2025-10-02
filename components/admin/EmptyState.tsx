import { LinkButton } from './Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}

export function EmptyState({ 
  icon = '📭', 
  title, 
  description, 
  actionLabel, 
  actionHref,
  className = '' 
}: EmptyStateProps) {
  return (
    <div className={`text-center py-12 ${className}`}>
      <div className="text-6xl mb-4">{icon}</div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">{description}</p>
      {actionLabel && actionHref && (
        <LinkButton href={actionHref} variant="primary">
          {actionLabel}
        </LinkButton>
      )}
    </div>
  );
}