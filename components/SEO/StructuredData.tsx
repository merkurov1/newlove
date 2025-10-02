// components/SEO/StructuredData.tsx
import Script from 'next/script';

interface PersonSchemaProps {
  name: string;
  url: string;
  image?: string;
  jobTitle?: string;
  description?: string;
  sameAs?: string[];
}

interface ArticleSchemaProps {
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  author: {
    name: string;
    url: string;
  };
  image?: string;
  url: string;
}

interface WebsiteSchemaProps {
  name: string;
  url: string;
  description: string;
  author: string;
}

export function PersonSchema({ name, url, image, jobTitle, description, sameAs }: PersonSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": name,
    "url": url,
    ...(image && { "image": image }),
    ...(jobTitle && { "jobTitle": jobTitle }),
    ...(description && { "description": description }),
    ...(sameAs && sameAs.length > 0 && { "sameAs": sameAs }),
  };

  return (
    <Script
      id="person-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function ArticleSchema({ headline, description, datePublished, dateModified, author, image, url }: ArticleSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": headline,
    "description": description,
    "datePublished": datePublished,
    "dateModified": dateModified || datePublished,
    "author": {
      "@type": "Person",
      "name": author.name,
      "url": author.url
    },
    ...(image && { 
      "image": {
        "@type": "ImageObject",
        "url": image
      }
    }),
    "url": url,
    "publisher": {
      "@type": "Person", 
      "name": author.name,
      "url": author.url
    }
  };

  return (
    <Script
      id="article-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebsiteSchema({ name, url, description, author }: WebsiteSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Website",
    "name": name,
    "url": url,
    "description": description,
    "author": {
      "@type": "Person",
      "name": author,
      "url": url
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `${url}/search?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <Script
      id="website-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function BlogSchema({ name, url, description, author }: WebsiteSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": name,
    "url": url,
    "description": description,
    "author": {
      "@type": "Person",
      "name": author,
      "url": url
    }
  };

  return (
    <Script
      id="blog-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}