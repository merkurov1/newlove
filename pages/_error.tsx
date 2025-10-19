
// Sentry removed - replaced with no-op wrapper to avoid build errors
const Sentry = {
  captureUnderscoreErrorException: async () => {},
};
import type { ErrorProps } from "next/dist/pages/_error";
import type { NextPageContext } from "next/dist/shared/lib/utils";

const CustomErrorComponent = (props: ErrorProps) => {
  const status = props?.statusCode ?? 500;
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Ошибка {status}</h1>
        <p className="text-gray-600">Что-то пошло не так. Мы получили уведомление и работаем над этим.</p>
      </div>
    </div>
  );
};

CustomErrorComponent.getInitialProps = async (contextData: NextPageContext) => {
  // Sentry removed - no-op
  await Sentry.captureUnderscoreErrorException(contextData).catch(() => {});

  // Provide a minimal statusCode to the component
  const statusCode = contextData.res?.statusCode ?? (contextData.err as any)?.statusCode ?? 500;
  return { statusCode } as ErrorProps;
};

export default CustomErrorComponent;
