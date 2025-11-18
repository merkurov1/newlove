import ContentForm from '@/components/admin/ContentForm';
import { createArticle } from '../../actions';

export default function NewSelectionPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Новая публикация</h1>
      <ContentForm saveAction={createArticle} type="публикацию" />
    </div>
  );
}
