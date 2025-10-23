export function buildSafeDebug(request: Request, opts?: {
    restStatus?: number;
    restBody?: any;
    errors?: any[];
}) {
    // requestId: small unique string
    let requestId = 'r-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000).toString(36);

    const headerSnapshot: Record<string, any> = {
        host: (() => { try { return request.headers.get('host') || undefined } catch { return undefined } })(),
        userAgent: (() => { try { return request.headers.get('user-agent') || undefined } catch { return undefined } })(),
        cookiePresent: (() => { try { return Boolean(request.headers.get('cookie')) } catch { return false } })()
    };

    const rest: Record<string, any> | undefined = opts && typeof opts.restStatus === 'number' ? {
        status: opts!.restStatus,
        bodyPreview: (() => {
            try {
                if (opts && opts.restBody == null) return undefined;
                const asString = typeof opts!.restBody === 'string' ? opts!.restBody : JSON.stringify(opts!.restBody);
                return asString.length > 1000 ? asString.slice(0, 1000) + '...' : asString;
            } catch { return String(opts!.restBody).slice(0, 1000); }
        })(),
    } : undefined;

    const errors = (opts && Array.isArray(opts.errors) && opts.errors.length > 0) ? opts.errors.map(e => String(e).slice(0, 500)) : undefined;

    const out: Record<string, any> = { requestId, headerSnapshot };
    if (rest) out.rest = rest;
    if (errors) out.errors = errors;
    return out;
}

export default buildSafeDebug;
