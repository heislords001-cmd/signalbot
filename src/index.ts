import { Bot, webhookCallback } from "grammy";
import { createBot } from "./bot";
import { analyzeSymbol, Signal } from "./signalEngine";

export interface Env {
  BOT_TOKEN: string;
  TWELVE_DATA_API_KEY: string;
  SIGNAL_CHANNEL_ID: string;
}

// The three main instruments
const MAIN_SYMBOLS = ["XAU/USD", "BTC/USD", "EUR/USD"];

// Track the last signal sent for each symbol to avoid duplicates
const lastSignals: Record<string, string> = {};

async function sendToChannel(bot: Bot, channelId: string, signal: Signal) {
  const emoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const arrow = signal.direction === "BUY" ? "📈" : "📉";

  const message = `
${emoji} *${signal.direction} ${signal.symbol}* ${arrow}

*Entry:* \`${signal.entry}\`
*Stop Loss:* \`${signal.stopLoss}\`
*Take Profit:* \`${signal.takeProfit}\`
*Risk/Reward:* 1:${signal.riskReward}

*Confidence:* ${signal.confidence}%

*Why:*
${signal.reasons.map((r) => `• ${r}`).join("\n")}
`.trim();

  await bot.api.sendMessage(channelId, message, { parse_mode: "Markdown" });
}

export default {
  // HTTP handler for Telegram webhook
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const bot = createBot(env.BOT_TOKEN, env.TWELVE_DATA_API_KEY);
    const handler = webhookCallback(bot, "cloudflare-mod");

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    // Telegram webhook
    if (url.pathname === "/webhook") {
      return handler(request);
    }

    return new Response("Not found", { status: 404 });
  },

  // Cron trigger handler — runs every 15 minutes
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const bot = createBot(env.BOT_TOKEN, env.TWELVE_DATA_API_KEY);

    for (const symbol of MAIN_SYMBOLS) {
      try {
        const signal = await analyzeSymbol(env.TWELVE_DATA_API_KEY, symbol);

        if (!signal) {
          // No signal, clear the tracker so the next one can fire
          delete lastSignals[symbol];
          continue;
        }

        // Check if this signal is different from the last one
        const signalKey = `${signal.direction}-${signal.entry}`;
        if (lastSignals[symbol] === signalKey) {
          continue; // Already sent this exact signal, skip
        }

        // Send to channel
        await sendToChannel(bot, env.SIGNAL_CHANNEL_ID, signal);
        lastSignals[symbol] = signalKey;

        console.log(`Sent ${signal.direction} signal for ${symbol}`);
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
      }
    }
  },
};