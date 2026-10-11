const TWELVE_DATA_API_KEY = "YOUR_API_KEY_HERE";
const BASE_URL = "https://api.twelvedata.com";

export interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchCandles(
  symbol: string,
  interval: string,
  outputsize: number = 100
): Promise<Candle[]> {
  const url = `${BASE_URL}/time_series?symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === "error") {
    throw new Error(`Twelve Data error: ${data.message}`);
  }

  if (!data.values || data.values.length === 0) {
    throw new Error(`No data returned for ${symbol} at ${interval}`);
  }

  return data.values.map((candle: any) => ({
    datetime: candle.datetime,
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseInt(candle.volume || "0"),
  }));
}