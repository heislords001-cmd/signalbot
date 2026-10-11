import { Bot, InlineKeyboard } from "grammy";
import { analyzeSymbol, Signal } from "./signalEngine";

// The three main instruments we scan
const MAIN_SYMBOLS = ["XAU/USD", "BTC/USD", "EUR/USD"];

// All symbols available for manual lookup
const ALL_SYMBOLS = [
  "XAU/USD", "BTC/USD", "EUR/USD",
  "GBP/USD", "USD/JPY", "AUD/USD",
  "USD/CAD", "USD/CHF", "NZD/USD",
  "ETH/USD", "SOL/USD",
];

function formatSignal(signal: Signal): string {
  const emoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const arrow = signal.direction === "BUY" ? "📈" : "📉";

  return `
${emoji} *${signal.direction} ${signal.symbol}* ${arrow}

*Entry:* \`${signal.entry}\`
*Stop Loss:* \`${signal.stopLoss}\`
*Take Profit:* \`${signal.takeProfit}\`
*Risk/Reward:* 1:${signal.riskReward}

*Confidence:* ${signal.confidence}%

*Why:*
${signal.reasons.map((r) => `• ${r}`).join("\n")}

_Generated: ${new Date(signal.timestamp).toLocaleString()}_
`.trim();
}

export function createBot(token: string, twelveDataKey: string): Bot {
  const bot = new Bot(token);

  // /start command
  bot.command("start", async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text("📊 Scan Markets", "scan")
      .row()
      .text("💰 Prices", "prices")
      .row()
      .text("📖 Help", "help");

    await ctx.reply(
      `*Welcome to the Signal Bot* 🤖\n\nI scan XAU/USD, BTC/USD, and EUR/USD every 15 minutes and alert you when there's a high-confluence setup.\n\nCommands:\n/signal <symbol> — Get a signal\n/scan — Scan all main markets\n/price <symbol> — Get current price\n/help — Show this menu`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  });

  // /help command
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `*Available Commands*\n\n/signal XAUUSD — Get signal for gold\n/signal BTCUSD — Get signal for Bitcoin\n/signal EURUSD — Get signal for Euro\n/scan — Scan all three main markets\n/price XAUUSD — Get current price\n\n*How signals work:*\nI only fire when 15M, 1H, and 4H all align. If they don't, I stay silent. No signal = no trade.`,
      { parse_mode: "Markdown" }
    );
  });

  // /price <symbol>
  bot.command("price", async (ctx) => {
    const args = ctx.match?.trim().toUpperCase();
    if (!args) {
      await ctx.reply("Usage: `/price XAUUSD`", { parse_mode: "Markdown" });
      return;
    }

    const formatted = args.includes("/") ? args : `${args.slice(0, 3)}/${args.slice(3)}`;

    try {
      const url = `https://api.twelvedata.com/price?symbol=${formatted}&apikey=${twelveDataKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.price) {
        await ctx.reply(`💵 *${formatted}*: \`${parseFloat(data.price).toFixed(5)}\``, {
          parse_mode: "Markdown",
        });
      } else {
        await ctx.reply(`❌ Could not fetch price for ${formatted}.`);
      }
    } catch {
      await ctx.reply("❌ Error fetching price. Try again.");
    }
  });

  // /signal <symbol>
  bot.command("signal", async (ctx) => {
    const args = ctx.match?.trim().toUpperCase();
    if (!args) {
      await ctx.reply("Usage: `/signal XAUUSD`", { parse_mode: "Markdown" });
      return;
    }

    const formatted = args.includes("/") ? args : `${args.slice(0, 3)}/${args.slice(3)}`;

    const loadingMsg = await ctx.reply(`🔍 Analyzing ${formatted}...`);

    try {
      const signal = await analyzeSymbol(twelveDataKey, formatted);

      if (signal) {
        await ctx.api.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          formatSignal(signal),
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.api.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          `⚪ *No signal for ${formatted}*\n\nThe timeframes are not aligned, or the market is ranging. Wait for the next candle.`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (err) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        `❌ Error analyzing ${formatted}. Try again later.`
      );
    }
  });

  // /scan command
  bot.command("scan", async (ctx) => {
    const loadingMsg = await ctx.reply("🔍 Scanning XAU/USD, BTC/USD, EUR/USD...");

    const results: string[] = [];
    for (const symbol of MAIN_SYMBOLS) {
      try {
        const signal = await analyzeSymbol(twelveDataKey, symbol);
        if (signal) {
          results.push(formatSignal(signal));
        } else {
          results.push(`⚪ *${symbol}* — no signal (timeframes not aligned)`);
        }
      } catch {
        results.push(`❌ *${symbol}* — error fetching data`);
      }
    }

    await ctx.api.editMessageText(
      ctx.chat.id,
      loadingMsg.message_id,
      results.join("\n\n─────────────\n\n"),
      { parse_mode: "Markdown" }
    );
  });

  // Inline button handlers
  bot.callbackQuery("scan", async (ctx) => {
    await ctx.answerCallbackQuery("Scanning...");
    await ctx.reply("Use /scan to run a full market scan.");
  });

  bot.callbackQuery("prices", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use `/price XAUUSD` to check any price.", { parse_mode: "Markdown" });
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /help to see all commands.");
  });

  return bot;
}