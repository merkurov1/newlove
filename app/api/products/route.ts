import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';
import { createId } from '@paralleldrive/cuid2';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const onlyActive = searchParams.get('active') === 'true';
    
    const products = await prisma.product.findMany({
      where: onlyActive ? { active: true } : undefined,
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    console.log('Creating product with data:', data);
    
    const { name, slug, price, description, image, active } = data;

    if (!name || !slug || !price) {
      return NextResponse.json(
        { error: 'Name, slug and price are required' },
        { status: 400 }
      );
    }

    // Проверка уникальности slug
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: 'Product with this slug already exists' },
        { status: 400 }
      );
    }

    const productData = {
      id: createId(), // Явно генерируем CUID
      name,
      slug,
      price: parseFloat(price), // Исправлено на parseFloat для Decimal
      description: description || null,
      image: image || null,
      active: active !== undefined ? Boolean(active) : true
    };
    
    console.log('Creating product with processed data:', productData);

    const product = await prisma.product.create({
      data: productData
    });
    
    console.log('Product created successfully:', product);

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { error: `Internal Server Error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}