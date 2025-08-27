import supabase from '@/lib/supabase-client';

export default function ProjectPage() {
  const router = useRouter();
  const { id } = router.query;
  const [page, setPage] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('project_pages').select('*').eq('id', id).single();
      setPage(data);
    })();
  }, [id]);

  if (!page) return <div>Загрузка...</div>;

  return (
    <div>
      <h1>{page.title}</h1>
      <div>{page.content}</div>
    </div>
  );
}
