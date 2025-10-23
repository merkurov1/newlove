import { NextResponse } from 'next/server';
import { adminUpdateUserRole, adminDeleteUser } from '@/app/admin/actions';

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, userId, role } = body || {};
    if (!action || !userId) return NextResponse.json({ status: 'error', message: 'Missing parameters' }, { status: 400 });
    if (action === 'updateRole') {
      const res = await adminUpdateUserRole(userId, role);
      return NextResponse.json(res);
    }
    if (action === 'deleteUser') {
      const res = await adminDeleteUser(userId);
      return NextResponse.json(res);
    }
    return NextResponse.json({ status: 'error', message: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('api/admin/users error', e);
    return NextResponse.json({ status: 'error', message: String(e) }, { status: 500 });
  }
}
