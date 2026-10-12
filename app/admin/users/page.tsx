import { getServerSupabaseClient } from "@/lib/serverAuth";
import { getRoleEmoji, getRoleName } from "@/lib/roles";
import UserActionsClient from "@/components/admin/UserActionsClient";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  role: string;
  createdAt: string | null;
  image: string | null;
};

export default async function AdminUsersPage() {
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  let users: UserRow[] = [];
  let loadError: string | null = null;

  try {
    const [authResult, profilesResult, subscribersResult] = await Promise.all([
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabase
        .from("users")
        .select("id,email,username,name,role"),
      supabase
        .from("subscribers")
        .select("id,email,isActive,userId"),
    ]);

    if (authResult.error) throw authResult.error;
    if (profilesResult.error) throw profilesResult.error;

    const profiles = profilesResult.data ?? [];
    const profileById = new Map(
      profiles.map((profile: any) => [String(profile.id), profile]),
    );

    users = (authResult.data.users ?? []).map((authUser: any) => {
      const profile: any = profileById.get(String(authUser.id));

      return {
        id: authUser.id,
        email: authUser.email ?? profile?.email ?? null,
        name:
          profile?.name ??
          authUser.user_metadata?.name ??
          authUser.user_metadata?.full_name ??
          null,
        username:
          profile?.username ??
          authUser.user_metadata?.username ??
          null,
        role: profile?.role === "ADMIN" ? "ADMIN" : "USER",
        createdAt: authUser.created_at ?? null,
        image:
          authUser.user_metadata?.avatar_url ??
          authUser.user_metadata?.image ??
          null,
      };
    });

    const subscribers = subscribersResult.data ?? [];
    const subscribersByUser = new Map<string, any>();

    for (const subscriber of subscribers) {
      if (subscriber.userId) {
        subscribersByUser.set(String(subscriber.userId), subscriber);
      }
    }

    const activeEmailSet = new Set(
      subscribers
        .filter((subscriber: any) => subscriber.isActive && subscriber.email)
        .map((subscriber: any) => String(subscriber.email).toLowerCase()),
    );

    const userSubscriptionStatus = new Map<string, boolean>();

    for (const user of users) {
      const subscription = subscribersByUser.get(user.id);
      userSubscriptionStatus.set(
        user.id,
        subscription
          ? Boolean(subscription.isActive)
          : Boolean(
              user.email &&
                activeEmailSet.has(user.email.toLowerCase()),
            ),
      );
    }

    users.sort((a, b) => {
      if (a.role === "ADMIN" && b.role !== "ADMIN") return -1;
      if (b.role === "ADMIN" && a.role !== "ADMIN") return 1;
      return (a.email ?? "").localeCompare(b.email ?? "");
    });

    return (
      <div className="space-y-8 pb-10">
        <header className="border-b border-[#D9D3CD] pb-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
            Workspace / Access
          </p>
          <h1 className="mt-3 font-serif text-4xl tracking-tight sm:text-5xl">
            Users
          </h1>
          <p className="mt-2 text-sm text-[#746D66]">
            Accounts, roles and newsletter subscriptions.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          {[
            { label: "Accounts", value: users.length },
            {
              label: "Administrators",
              value: users.filter((user) => user.role === "ADMIN").length,
            },
            {
              label: "Subscribed",
              value: users.filter(
                (user) => userSubscriptionStatus.get(user.id) === true,
              ).length,
            },
          ].map((stat) => (
            <div key={stat.label} className="border-t border-[#D9D3CD] py-4">
              <p className="text-xs text-[#746D66]">{stat.label}</p>
              <p className="mt-2 font-serif text-3xl">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto border-y border-[#D9D3CD]">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#D9D3CD] font-mono text-[10px] uppercase tracking-wider text-[#89827B]">
                <th className="py-3 pr-4 font-normal">Account</th>
                <th className="px-4 py-3 font-normal">Joined</th>
                <th className="px-4 py-3 font-normal">Newsletter</th>
                <th className="px-4 py-3 font-normal">Role</th>
                <th className="py-3 pl-4 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const subscribed =
                  userSubscriptionStatus.get(user.id) ?? false;

                return (
                  <tr
                    key={user.id}
                    className="border-b border-[#EAE6E1] align-middle last:border-0"
                  >
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        {user.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.image}
                            alt=""
                            width={36}
                            height={36}
                            className="h-9 w-9 shrink-0 object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#D9D3CD] font-serif text-sm">
                            {(user.name || user.email || "?")
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {user.name || user.username || "Unnamed user"}
                          </p>
                          <p className="mt-1 truncate text-xs text-[#827B74]">
                            {user.email || "No email"}
                          </p>
                          {user.username && (
                            <p className="mt-1 truncate font-mono text-[10px] text-[#A29B94]">
                              @{user.username}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-[#746D66]">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={
                          subscribed
                            ? "text-xs text-[#356B4D]"
                            : "text-xs text-[#89827B]"
                        }
                      >
                        {subscribed ? "Subscribed" : "Not subscribed"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs">
                        {getRoleEmoji(user.role)} {getRoleName(user.role)}
                      </span>
                    </td>
                    <td className="py-4 pl-4">
                      <UserActionsClient
                        userId={user.id}
                        currentRole={user.role}
                        isSubscribed={subscribed}
                      />
                    </td>
                  </tr>
                );
              })}

              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-sm text-[#89827B]"
                  >
                    No user accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-[#89827B]">
          Showing up to 1,000 accounts. Role changes are verified by the server.
        </p>
      </div>
    );
  } catch (error) {
    console.error("[admin/users] failed to load users:", error);
    loadError =
      "Unable to load users. Check the Supabase Auth and public.users queries.";
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-4xl">Users</h1>
      <div
        role="alert"
        className="border border-[#E7C9D2] bg-[#FFF1E5] p-4 text-sm text-[#7E0C33]"
      >
        {loadError}
      </div>
    </div>
  );
}