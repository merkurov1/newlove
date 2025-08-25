export async function getStaticPaths() {
  const paths = [{ params: { slug: 'welcome' } }];
  console.log('Paths:', paths);
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const { slug } = params;
  console.log('Slug:', slug);
  const article = await fetchArticleBySlug(slug);
  console.log('Article:', article);
  if (!article) return { notFound: true };
  return { props: { article } };
}