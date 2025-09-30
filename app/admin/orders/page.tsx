async function getOrders() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?select=*`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return await res.json();
}

export default async function AdminOrdersPage() {
  const orders = await getOrders();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">История заказов</h1>
      <table className="min-w-full bg-white border rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-3">Дата</th>
            <th className="p-3">Товар</th>
            <th className="p-3">Email</th>
            <th className="p-3">Статус</th>
            <th className="p-3">Stripe Session</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order: any) => (
            <tr key={order.id} className="border-t hover:bg-gray-50">
              <td className="p-3">{new Date(order.created_at).toLocaleString()}</td>
              <td className="p-3">{order.product_name}</td>
              <td className="p-3">{order.user_email}</td>
              <td className="p-3">{order.status}</td>
              <td className="p-3 text-xs text-gray-400">{order.stripe_session_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
