'use strict';
// Guest PIN for devices on the home network.
// - The PIN is stored only as a salted scrypt hash in config.json.
// - A device that enters the right PIN gets a random token in an HttpOnly cookie;
//   only the SHA-256 of that token is stored (data/devices.json), with a name and last-seen time.
// - Wrong guesses lock the device out with growing delays, plus a network-wide limit.

const crypto = require('crypto');
const fs = require('fs');

const COOKIE = 'hc_auth';
const ONE_YEAR = 365 * 24 * 3600;

function hashPin(pin, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}

function verifyPin(pin, stored) {
  if (!stored || !stored.hash || !stored.salt) return false;
  const h = hashPin(pin, stored.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(stored.hash, 'hex'));
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

function deviceName(ua) {
  ua = String(ua || '');
  if (/VIDAA|Hisense/i.test(ua)) return 'Hisense TV';
  if (/AFT|Fire TV|Silk/i.test(ua)) return 'Fire TV';
  if (/Kepler|Vega/i.test(ua)) return 'Fire TV (Vega)';
  if (/SMART-TV|SmartTV|Tizen|Web0S|webOS|HbbTV/i.test(ua)) return 'Smart TV';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android device';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux device';
  return 'Device';
}

class GuestAuth {
  /** @param {{getPin:()=>object|null, setPin:(v:object|null)=>void, devicesFile:string}} o */
  constructor(o) {
    this.getPin = o.getPin;
    this.setPinStore = o.setPin;
    this.file = o.devicesFile;
    this.devices = {};
    try { this.devices = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* first run */ }
    this.fails = new Map(); // ip -> {count, until}
    this.globalFails = [];  // timestamps of recent failures from any device
    this.saveTimer = null;
  }

  get enabled() { return !!(this.getPin() && this.getPin().hash); }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => fs.writeFile(this.file, JSON.stringify(this.devices, null, 1), () => {}), 500);
  }

  /** Is this request from a signed-in device? (Call only when the PIN is enabled.) */
  check(req) {
    const tok = parseCookies(req)[COOKIE];
    if (!tok || tok.length < 20) return false;
    const d = this.devices[sha(tok)];
    if (!d) return false;
    const now = Date.now();
    if (now - (d.lastSeen || 0) > 60000) { d.lastSeen = now; d.ip = clientIp(req); this.save(); }
    return true;
  }

  /** Seconds until this IP may try again (0 = allowed). */
  lockedFor(ip) {
    const now = Date.now();
    this.globalFails = this.globalFails.filter((t) => now - t < 3600e3);
    if (this.globalFails.length >= 30) return Math.ceil((this.globalFails[0] + 3600e3 - now) / 1000);
    const f = this.fails.get(ip);
    return f && f.until > now ? Math.ceil((f.until - now) / 1000) : 0;
  }

  /** Try a PIN. Returns {ok, token?, wait?, left?} */
  attempt(req, pin) {
    const ip = clientIp(req);
    const wait = this.lockedFor(ip);
    if (wait) return { ok: false, wait };
    if (verifyPin(String(pin || ''), this.getPin())) {
      this.fails.delete(ip);
      const token = crypto.randomBytes(32).toString('base64url');
      this.devices[sha(token)] = { name: deviceName(req.headers['user-agent']), ip, created: Date.now(), lastSeen: Date.now() };
      this.save();
      return { ok: true, token };
    }
    const f = this.fails.get(ip) || { count: 0, until: 0 };
    f.count++;
    this.globalFails.push(Date.now());
    // 5 free tries, then 1 min, 2 min, 4 min ... up to 1 hour between tries
    if (f.count >= 5) f.until = Date.now() + Math.min(3600, 60 * Math.pow(2, f.count - 5)) * 1000;
    this.fails.set(ip, f);
    return { ok: false, left: Math.max(0, 5 - f.count), wait: this.lockedFor(ip) };
  }

  cookieHeader(token) { return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; SameSite=Lax`; }

  setPin(pin) {
    if (pin == null || pin === '') { this.setPinStore(null); this.devices = {}; this.save(); return; }
    this.setPinStore(hashPin(pin));
  }

  list() {
    return Object.keys(this.devices).map((id) => Object.assign({ id: id.slice(0, 12) }, this.devices[id])).sort((a, b) => b.lastSeen - a.lastSeen);
  }

  forget(shortId) {
    if (shortId === '*') this.devices = {};
    else for (const k of Object.keys(this.devices)) if (k.slice(0, 12) === shortId) delete this.devices[k];
    this.save();
  }
}

function clientIp(req) { return (req.socket.remoteAddress || '').replace(/^::ffff:/, ''); }

module.exports = { GuestAuth, hashPin, verifyPin, deviceName };
