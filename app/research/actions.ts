'use server'

import { Bot } from "grammy";

export async function submitInquiry(formData: FormData): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const myId = process.env.MY_TELEGRAM_ID;
  
  if (!token || !myId) {
    console.error('submitInquiry: missing config');
    return;
  }

  const name = formData.get("name") as string;
  const org = formData.get("org") as string;
  const email = formData.get("email") as string;
  if (!name || !email) {
    console.error('submitInquiry: missing fields', { name, email });
    return;
  }

  const bot = new Bot(token);
  
  const message = `
🏛 <b>NEW ACADEMIC INQUIRY</b>

👤 <b>Who:</b> ${name}
🏢 <b>Org:</b> ${org || "N/A"}
UD <b>Contact:</b> ${email}

<i>Source: /research page</i>
`;

  try {
    await bot.api.sendMessage(Number(myId), message, { parse_mode: "HTML" });
  } catch (e) {
    console.error('submitInquiry: telegram send failed', e);
  }
}