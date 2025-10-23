Note: user has no browser DevTools available

Observed issue (from user):

- After login, the UI does not update until a full page refresh.
- Vercel server logs show a 401 Unauthorized for the endpoint: /api/letters/[slug]/comments
- User cannot inspect network requests in the browser (no DevTools).

Immediate facts (code inspection):

- The comments API enforces authentication for GET and POST. GET returns 401 when unauthenticated.
  - File: app/api/letters/[slug]/comments/route.ts
  - GET/POST both call getUserAndSupabaseForRequest(req) and return 401 when user is not present.
- Server-side helpers try multiple ways to derive user from Request:
  - getUserAndSupabaseForRequest -> supabaseInterop -> supabase-server.getUserAndSupabaseFromRequest
  - tokenUtils can reconstruct tokens from cookie header names like "sb-access-token" or "supabase-access-token"
- Cookies are set by app/api/auth/set-cookie/route.ts with flags: Path=/; HttpOnly; Secure; SameSite=Lax
  - In production, the endpoint also checks origin/referer against NEXT_PUBLIC_SITE_URL and may return 403 origin_mismatch (this can prevent cookies being set).

Suggested non-DevTools debugging steps (execute in terminal / server logs / Vercel dashboard):

1. Hit role diagnostics endpoint (returns useful debug JSON):

   - GET https://<YOUR_SITE>/api/user/role
   - This endpoint returns JSON with `debug` that includes `rawCookieHeader` and `requestHeaderKeys` which show what headers Vercel forwarded.
   - Example curl (replace <YOUR_SITE>):
     curl -i -s "https://<YOUR_SITE>/api/user/role" | jq .
   - If you want to include cookies (if you have them), use:
     curl -i -s -H "Cookie: sb-access-token=<TOKEN>" "https://<YOUR_SITE>/api/user/role" | jq .

2. After login, check Vercel function logs for the path `/api/auth/set-cookie` to see whether the endpoint returned `origin_mismatch` or a 403 which would prevent cookies from being set.

   - Look for requests to `/api/auth/set-cookie` and responses (200 OK vs 403). If origin_mismatch occurred, ensure NEXT_PUBLIC_SITE_URL matches the deployed origin.

3. If you can run curl from the same machine where you can obtain cookies (or via a script), capture cookies and replay:

   - Capture (if you can run login via curl or have cookie values):
     curl -c cookiejar -i -X POST -d '{...}' "https://<YOUR_SITE>/api/auth/set-cookie" -H "Content-Type: application/json"
   - Replay:
     curl -b cookiejar -i "https://<YOUR_SITE>/api/letters/<SLUG>/comments?\_debug=1"

4. Use the comments debug param (limited):

   - GET https://<YOUR_SITE>/api/letters/<SLUG>/comments?\_debug=1
   - When unauthenticated it returns 401 with debug viewer=null. This confirms the route's unauthenticated branch.

5. Quick checks to consider (likely causes):
   - Cookies not being set because `SameSite`/`Secure`/domain mismatch or origin check prevented Set-Cookie.
   - Cookies are set but not sent because requests are cross-site or missing `credentials: 'include'`/`same-origin` on client fetches.
   - Authorization header not present because client doesn't send it; server expects cookie or Authorization bearer.

Temporary diagnostic code (optional):

- If you're comfortable, add a short server route that echoes request headers for a short time (only in a non-public branch or behind admin auth). I can prepare this patch for you if you want.

Next actions I can take now (pick one):

- Prepare and push a small debug API that returns request headers (safe, short-lived).
- Show exact curl commands for your environment using your site domain so you can run them and paste responses.
- Walk through verifying `/api/auth/set-cookie` behavior and where to look in Vercel logs.

Recorded for later: user has no DevTools and sees 401 for /api/letters/[slug]/comments in Vercel logs.
