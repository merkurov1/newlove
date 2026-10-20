
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const response = () =>
  NextResponse.json(
    { success: false, error: 'Todo functionality is disabled.' },
    { status: 410 }
  );

export async function GET() {
  return response();
}

export async function POST() {
  return response();
}

export async function PATCH() {
  return response();
}

export async function DELETE() {
  return response();
}
