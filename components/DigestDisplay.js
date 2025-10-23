// components/DigestDisplay.js
// КАНДИДАТ НА УДАЛЕНИЕ: не используется ни в одном компоненте или странице
import ReactMarkdown from 'react-markdown';

// Пример CSS для базового оформления. Добавьте в ваш глобальный CSS файл.
/*
.digest-content h2 {
  font-size: 2em;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5em;
  margin-bottom: 1em;
}
.digest-content h3 {
  font-size: 1.5em;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}
.digest-content p {
  line-height: 1.6;
}
.digest-content a {
  color: #0070f3;
  text-decoration: none;
}
.digest-content a:hover {
  text-decoration: underline;
}
.digest-content hr {
    border: 0;
    height: 1px;
    background: #ddd;
    margin: 2em 0;
}
*/

export default function DigestDisplay({ content }) {
  return (
    <div className="digest-content">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
