
import ContentForm from '@/components/admin/ContentForm';
import { createLetter } from '../../actions';

export default function NewLetterPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">New Letter</h1>
      <ContentForm saveAction={createLetter} type="letter" />
    </div>
  );
}
