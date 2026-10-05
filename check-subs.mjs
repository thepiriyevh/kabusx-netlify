// Hər dəqiqə işləyir (Netlify Scheduled Function) — YouTube-u yoxlayır, Telegrama yazır
import { getStore } from "@netlify/blobs";

export const config = { schedule: "* * * * *" }; // UTC, ən sıx: hər dəqiqə

const MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const fmt = (n) => n.toLocaleString("tr-TR");

async function sendTelegram(text) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text }),
  });
  const data = await res.json();
  if (!data.ok) console.error("Telegram xətası:", data.description);
  return data.ok;
}

async function fetchStats() {
  const { YT_API_KEY, CHANNEL_ID } = process.env;
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${CHANNEL_ID}&key=${YT_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  if (!data.items?.length) throw new Error("Kanal verisi alınamadı");
  const it = data.items[0];
  return { subs: parseInt(it.statistics.subscriberCount, 10), name: it.snippet.title };
}

export default async () => {
  const mode = process.env.NOTIFY_MODE || "milestone"; // "milestone" | "everyChange"
  const store = getStore("kabusx-state");

  let subs, name;
  try {
    ({ subs, name } = await fetchStats());
  } catch (e) {
    console.error("YouTube xətası:", e.message);
    const fails = Number((await store.get("fails")) || 0) + 1;
    await store.set("fails", String(fails));
    if (fails === 5) await sendTelegram(`⚠️ YouTube sorğusu ${fails} dəfə uğursuz oldu: ${e.message}`);
    return;
  }

  const failsBefore = Number((await store.get("fails")) || 0);
  if (failsBefore >= 5) await sendTelegram(`✅ ${name}: izləmə bərpa olundu (${fmt(subs)})`);
  if (failsBefore) await store.set("fails", "0");

  const lastRaw = await store.get("last");
  const last = lastRaw === null ? null : Number(lastRaw);

  if (last === null) {
    await sendTelegram(`✅ ${name}: izləmə başladı (${fmt(subs)} abunəçi)`);
  } else if (last !== subs) {
    for (const m of MILESTONES) {
      if (last < m && subs >= m) await sendTelegram(`🎉 ${name} kanalı ${fmt(m)} abunəçiyə çatdı!`);
    }
    if (mode === "everyChange") {
      const diff = subs - last;
      await sendTelegram(`${diff > 0 ? "📈" : "📉"} ${name}: ${diff > 0 ? "+" : ""}${diff} abunəçi (indi ${fmt(subs)})`);
    }
  }
  if (last !== subs) await store.set("last", String(subs));
};
