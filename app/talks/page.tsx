// app/talks/page.tsx
import LoungeInterface from "@/components/LoungeInterface";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";

async function getMessages() {
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true, image: true } } },
    take: 100,
  });
  return messages;
}

export default async function TalksPage() {
  const initialMessages = await getMessages();
  const session = await getServerSession(authOptions);
  return <LoungeInterface initialMessages={initialMessages} session={session} />;
}
