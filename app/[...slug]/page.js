// app/[…slug]/page.js
import { notFound } from ‘next/navigation’;
import { supabase } from ‘@/lib/supabase’;
import Header from ‘@/app/header’;

export default async function Page({ params }) {
const { slug } = params;
const articleSlug = Array.isArray(slug) ? slug[0] : slug;

const { data: article, error } = await supabase
.from(‘articles’)
.select(‘title, content’)
.eq(‘slug’, articleSlug)
.contains(‘tags’, [‘page’])
.single();

if (error || !article) {
notFound();
}

return (
<>
<Header />
<main style={mainStyles}>
<article style={containerStyles}>
<h1 style={titleStyles}>{article.title}</h1>
<div
className=“article-content”
style={contentStyles}
dangerouslySetInnerHTML={{ __html: article.content }}
/>
</article>
</main>

```
  <style jsx global>{`
    .article-content h1,
    .article-content h2,
    .article-content h3,
    .article-content h4,
    .article-content h5,
    .article-content h6 {
      color: #2c3e50;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    
    .article-content h2 {
      font-size: 1.8rem;
      border-left: 4px solid #3498db;
      padding-left: 15px;
    }
    
    .article-content h3 {
      font-size: 1.5rem;
      color: #34495e;
    }
    
    .article-content p {
      margin-bottom: 20px;
      text-align: justify;
    }
    
    .article-content ul,
    .article-content ol {
      margin: 20px 0;
      padding-left: 30px;
    }
    
    .article-content li {
      margin-bottom: 8px;
    }
    
    .article-content blockquote {
      border-left: 4px solid #e74c3c;
      margin: 20px 0;
      padding: 15px 20px;
      background: #f8f9fa;
      font-style: italic;
      color: #555;
    }
    
    .article-content code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: Monaco, Menlo, monospace;
      font-size: 0.9rem;
    }
    
    .article-content pre {
      background: #2c3e50;
      color: #fff;
      padding: 20px;
      border-radius: 5px;
      overflow-x: auto;
      margin: 20px 0;
    }
    
    .article-content pre code {
      background: none;
      padding: 0;
      color: inherit;
    }
    
    .article-content img {
      max-width: 100%;
      height: auto;
      border-radius: 5px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      margin: 20px 0;
    }
    
    .article-content a {
      color: #3498db;
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.3s ease;
    }
    
    .article-content a:hover {
      border-bottom-color: #3498db;
    }
    
    .article-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    }
    
    .article-content th,
    .article-content td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    
    .article-content th {
      background: #3498db;
      color: white;
      font-weight: 600;
    }
    
    .article-content tr:nth-child(even) {
      background: #f9f9f9;
    }
    
    @media (max-width: 768px) {
      .article-content {
        font-size: 1rem;
      }
    }
  `}</style>
</>
```

);
}

const mainStyles = {
maxWidth: ‘800px’,
margin: ‘0 auto’,
padding: ‘20px’,
fontFamily: ‘-apple-system, BlinkMacSystemFont, “Segoe UI”, Roboto, sans-serif’
};

const containerStyles = {
background: ‘#fff’,
borderRadius: ‘8px’,
boxShadow: ‘0 2px 10px rgba(0, 0, 0, 0.1)’,
padding: ‘40px’,
margin: ‘20px 0’
};

const titleStyles = {
fontSize: ‘2.5rem’,
fontWeight: ‘700’,
color: ‘#2c3e50’,
marginBottom: ‘30px’,
lineHeight: ‘1.2’,
borderBottom: ‘3px solid #3498db’,
paddingBottom: ‘15px’
};

const contentStyles = {
lineHeight: ‘1.6’,
color: ‘#444’,
fontSize: ‘1.1rem’
};

export async function generateStaticParams() {
const { data: articles, error } = await supabase
.from(‘articles’)
.select(‘slug’)
.eq(‘tags’, ‘page’); // Исправил синтаксис для тега

if (error || !articles || !Array.isArray(articles)) {
console.error(‘Ошибка генерации статических параметров:’, error);
return [];
}

return articles.map((article) => ({
slug: [article.slug],
}));
}