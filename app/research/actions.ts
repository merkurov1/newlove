'use server'

import { Bot } from "grammy";

export async function submitInquiry(formData: FormData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const myId = process.env.MY_TELEGRAM_ID;
  
  if (!token || !myId) return { success: false, error: "Config missing" };

  const name = formData.get("name") as string;
  const org = formData.get("org") as string;
  const email = formData.get("email") as string;

  if (!name || !email) return { success: false, error: "Missing fields" };

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
    return { success: true };
  } catch (e) {
    console.error(e);
    return { success: false, error: "Telegram failed" };
  }
}