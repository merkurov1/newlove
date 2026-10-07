import { NextRequest, NextResponse } from "next/server";
import Zod from "zod";

type ValidationSchema<T = unknown> = {
  safeParse: (
    data: unknown
  ) =>
    | {
        success: true;
        data: T;
      }
    | {
        success: false;
        error: {
          issues: unknown;
        };
      };
};

export function withValidation<T>(
  schema: ValidationSchema<T>,
  handler: (
    req: NextRequest,
    data: T,
    ...args: any[]
  ) => unknown | Promise<unknown>
) {
  return async (
    req: NextRequest,
    ...args: any[]
  ) => {
    let data: unknown;

    try {
      data = await req.json();
    } catch (error) {
      console.error(
        "Ошибка парсинга JSON:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Invalid JSON: " +
            (error instanceof Error
              ? error.message
              : String(error)),
        },
        { status: 400 }
      );
    }

    const result = schema.safeParse(data);

    if (!result.success) {
      console.error(
        "Ошибка валидации:",
        result.error,
        "Данные:",
        data
      );

      return NextResponse.json(
        {
          error: "Validation failed",
          details: result.error.issues,
        },
        { status: 400 }
      );
    }

    return handler(
      req,
      result.data,
      ...args
    );
  };
}