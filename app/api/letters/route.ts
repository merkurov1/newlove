export async function GET() {
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

export async function POST(request: Request) {
	// Placeholder implementation during migration. The real handler will
	// validate input and create/send a letter via Supabase/resend.
	const body = await request.text();
	return new Response(JSON.stringify({ ok: true, received: body }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

export function OPTIONS() {
	return new Response(null, { status: 204 });
}


