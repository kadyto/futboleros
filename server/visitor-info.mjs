import { isIP } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import maxmind from "maxmind";
import proxyaddr from "proxy-addr";
import UAParser from "ua-parser-js";

const require = createRequire(import.meta.url);
const database = path.dirname(
  require.resolve("@ip-location-db/dbip-city-mmdb/package.json"),
);
const countries = new Intl.DisplayNames(["es"], { type: "region" });
const localAddress = proxyaddr.compile([
  "loopback",
  "linklocal",
  "uniquelocal",
]);
// Published at https://www.cloudflare.com/ips/; only these proxy hops are trusted.
const cloudflareRanges = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];
const isCloudflare = proxyaddr.compile(cloudflareRanges);
const bots =
  /bot\b|crawler|spider|headless|lighthouse|preview|slurp|facebookexternalhit|monitoring|uptime|curl\b|wget\b|python-requests/i;
const label = (value) =>
  typeof value === "string"
    ? value
        .replace(/[\p{Cc}\p{Cf}]/gu, "")
        .trim()
        .slice(0, 80)
    : "";

export function deviceInfo(userAgent) {
  const ua = typeof userAgent === "string" ? userAgent.slice(0, 512) : "";
  if (!ua || bots.test(ua)) return null;
  const result = new UAParser(ua).getResult();
  const type = result.device.type;
  const device =
    type === "tablet"
      ? "Tablet"
      : type === "mobile"
        ? "Móvil"
        : ["smarttv", "console", "wearable", "embedded"].includes(type)
          ? "Otros"
          : /Windows|Macintosh|X11|CrOS|Linux/i.test(ua)
            ? "Ordenador"
            : "No disponible";
  const os = result.os.name;
  const system = /Windows/i.test(os || "")
    ? "Windows"
    : /Android/i.test(os || "")
      ? "Android"
      : /iOS/i.test(os || "")
        ? "iOS"
        : /Mac/i.test(os || "")
          ? "macOS"
          : /Chrom/i.test(os || "")
            ? "ChromeOS"
            : /Linux|Ubuntu|Debian|Fedora/i.test(os || "")
              ? "Linux"
              : "Otros";
  const model = label(result.device.model);
  const vendor = label(result.device.vendor);
  const usefulModel =
    ["Móvil", "Tablet"].includes(device) &&
    model &&
    !/^(K|Android|Mobile|Tablet|iPhone|iPad|iPod|Generic|Unknown)$/i.test(
      model,
    );
  return {
    device,
    system,
    model: usefulModel
      ? label(
          vendor && !model.startsWith(vendor) ? `${vendor} ${model}` : model,
        )
      : "No disponible",
  };
}

export function visitorAddress(req, trustedProxies = "") {
  const preset = trustedProxies.trim() === "cloudflare";
  const trust = preset
    ? proxyaddr.compile([
        "loopback",
        "linklocal",
        "uniquelocal",
        ...cloudflareRanges,
      ])
    : trustedProxies.trim()
      ? proxyaddr.compile(
          trustedProxies.split(",").map((value) => value.trim()),
        )
      : () => false;
  const chain = proxyaddr.all(req, trust);
  const cfAddress = req.headers["cf-connecting-ip"];
  const trustedCloudflareHop =
    preset && chain.some((ip) => isIP(ip) && isCloudflare(ip));
  const value =
    trustedCloudflareHop && typeof cfAddress === "string" && isIP(cfAddress)
      ? cfAddress
      : chain.at(-1);
  return value?.startsWith("::ffff:") ? value.slice(7) : value;
}

export class VisitorLocation {
  constructor({
    open = maxmind.open,
    databaseFile = process.env.GEOIP_DATABASE,
  } = {}) {
    this.open = open;
    this.databaseFile = databaseFile;
    this.readers = new Map();
  }
  async lookup(address) {
    const ip = address?.startsWith("::ffff:") ? address.slice(7) : address;
    const family = isIP(ip || "");
    if (!family || localAddress(ip)) return "No disponible";
    try {
      if (!this.readers.has(family)) {
        const reader = this.open(
          this.databaseFile ||
            path.join(database, `dbip-city-ipv${family}.mmdb`),
        ).catch((error) => {
          this.readers.delete(family);
          throw error;
        });
        this.readers.set(family, reader);
      }
      const record = (await this.readers.get(family)).get(ip);
      if (!record || !/^[A-Z]{2}$/.test(record.country_code || ""))
        return "No disponible";
      const country = countries.of(record.country_code);
      const place = label(record.city) || label(record.state1);
      return place ? `${place}, ${country}` : country;
    } catch {
      return "No disponible";
    }
  }
}
