
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function disabledResponse() {
  return NextResponse.json(
    {
      success: false,
      error: 'Todo functionality is disabled.',
    },
    { status: 410 }
  );
}

export async function GET() {
  return disabledResponse();
}

export async function POST() {
  return disabledResponse();
}

export async function PATCH() {
  return disabledResponse();
}

export async function DELETE() {
  return disabledResponse();
}
