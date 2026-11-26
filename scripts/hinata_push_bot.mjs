// Hinata Tamagotchi Cloud Push Bot (Native iOS PWA Web Push + optional Bark fallback + Firestore Mailbox Sync)
import { createRequire } from 'module';
const webpush = createRequire(import.meta.url)('web-push');

const FIREBASE_PROJECT = 'hinata-tamagotchi';
const FIREBASE_API_KEY = 'AIzaSyCqASayonPmiJSoku8s0oTrS12hv-0_P10';
const DOC_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/hinata_saves/main?key=${FIREBASE_API_KEY}`;
const GAME_URL = 'https://zeldris12313.github.io/hinata-tamagotchi/';
const ICON_NORMAL = `${GAME_URL}assets/chibiSchool.png`;
const ICON_CRY = `${GAME_URL}assets/chibiSchoolCry.png`;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BIhtiC0UKFDconvLKHdne1Tv_xG3BGe_YKfkc5kET7zgBRZyyey62ZuQfGufGnmO8sVJwhwthcqv5BZbxQqoaDI';
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();

const SCHOOL_LETTERS = [
  '「哥哥！今日返工企咗好耐腳仔累唔累呀？返到嚟我幫你揼骨！💛」',
  '「頭先練球見到天空好靚，即刻諗起同哥哥一齊散步嗰陣～🌤️」',
  '「小息喺課室悶悶哋，好掛住哥哥煮嘅熱辣辣晚餐呀！🍱」',
  '「哥哥！我今日練扣殺比尋日跳得仲高咗少少！！放學返嚟講你聽！🏐🔥」',
  '「午飯食得好飽！哥哥喺醫院 Canteen 記得唔好掛住做嘢唔食飯呀！🍚」',
  '「啱啱上堂差啲瞌眼瞓…但諗起放學十字路口見到哥哥就即刻醒晒！😊💛」'
];

function getHKNow() {
  const now = new Date();
  const hkMs = now.getTime() + 8 * 3600 * 1000;
  const hk = new Date(hkMs);
  const y = hk.getUTCFullYear();
  const m = hk.getUTCMonth() + 1;
  const d = hk.getUTCDate();
  const dow = hk.getUTCDay();
  const hour = hk.getUTCHours();
  const min = hk.getUTCMinutes();
  const todayStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const hh = String(hour).padStart(2, '0');
  const mm = String(min).padStart(2, '0');
  return { nowMs: now.getTime(), y, m, d, dow, hour, min, totalMin: hour * 60 + min, todayStr, timeLabel: `${hh}:${mm}` };
}

async function sendNotification(state, title, body, iconUrl, tag = 'hinata-msg') {
  let sentNative = false;
  // 1. Primary: Native iOS PWA Web Push (tapping notification opens Home Screen App directly!)
  if (state.webPushSub && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
      webpush.setVapidDetails('mailto:hinata@tamagotchi.local', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      await webpush.sendNotification(
        state.webPushSub,
        JSON.stringify({ title, body, icon: iconUrl, url: './', tag })
      );
      console.log('Native PWA Web Push sent:', title, body);
      sentNative = true;
    } catch (err) {
      console.error('Native Web Push error:', err.statusCode || err.message);
    }
  }
  // 2. Fallback: Bark (only if native push wasn't sent, and without &url= so it won't pop Safari)
  const barkUrl = (process.env.BARK_URL || state.barkUrl || '').trim();
  if (!sentNative && barkUrl) {
    const base = barkUrl.replace(/\/+$/, '');
    const endpoint = `${base}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?icon=${encodeURIComponent(iconUrl)}&group=Hinata`;
    const res = await fetch(endpoint);
    console.log('Bark fallback push:', res.status, title);
  }
}

async function main() {
  const res = await fetch(DOC_URL);
  if (!res.ok) { console.log('Firestore fetch failed:', res.status); return; }
  const doc = await res.json();
  const rawPayload = doc?.fields?.payload?.stringValue;
  if (!rawPayload) { console.log('No payload in Firestore yet.'); return; }
  const state = JSON.parse(rawPayload);

  if (!state.webPushSub && !(process.env.BARK_URL || state.barkUrl)) {
    console.log('No Web Push subscription or Bark URL found yet.');
    return;
  }

  const pet = state.pets?.hinata || state.pets?.[state.activeCharId || 'hinata'];
  if (!pet) return;
  const hk = getHKNow();
  const isCustomHol = state.holidayDate === hk.todayStr || (Array.isArray(state.customHolidays) && state.customHolidays.includes(hk.todayStr));
  const isWeekend = (hk.dow === 0 || hk.dow === 6) || isCustomHol;
  let dirty = false;

  // 1. Estimate current hunger / energy / mood
  const bal = state.balance || {};
  const elapsedHrs = Math.max(0, Math.min(24, (hk.nowMs - (pet.lastUpdated || hk.nowMs)) / 3600000));
  const estHunger = Math.max(0, Math.min(100, (pet.hunger ?? 80) + elapsedHrs * ((bal.normal && bal.normal.hunger) ?? -5)));
  const estEnergy = Math.max(0, Math.min(100, (pet.energy ?? 80) + elapsedHrs * ((bal.normal && bal.normal.energy) ?? -3)));
  const estMood   = Math.max(0, Math.min(100, (pet.mood ?? 80)   + elapsedHrs * ((bal.normal && bal.normal.mood) ?? -2)));

  if (!pet.lastLowAlertAt) pet.lastLowAlertAt = { hunger: 0, energy: 0, mood: 0 };
  const COOL_MS = 2 * 3600 * 1000;

  if (hk.hour >= 8 && hk.hour <= 23) {
    if (estHunger <= 25 && hk.nowMs - (pet.lastLowAlertAt.hunger || 0) >= COOL_MS) {
      await sendNotification(state, '日向翔陽好肚餓 🍙', `「哥哥…我個肚仔好餓呀（飽食約 ${Math.round(estHunger)}%），快啲返嚟餵我食嘢啦！😢」`, ICON_CRY, 'hinata-hunger');
      pet.lastLowAlertAt.hunger = hk.nowMs;
      dirty = true;
    }
    if (estEnergy <= 25 && hk.nowMs - (pet.lastLowAlertAt.energy || 0) >= COOL_MS) {
      await sendNotification(state, '日向翔陽好攰呀 ⚡', `「哥哥…我冇晒電好眼瞓呀（精力約 ${Math.round(estEnergy)}%），過嚟睇下我啦…😴」`, ICON_CRY, 'hinata-energy');
      pet.lastLowAlertAt.energy = hk.nowMs;
      dirty = true;
    }
    if (estMood <= 30 && hk.nowMs - (pet.lastLowAlertAt.mood || 0) >= COOL_MS) {
      await sendNotification(state, '日向翔陽唔開心 😢', `「哥哥…我心情有啲低落（心情約 ${Math.round(estMood)}%），可唔可以摸下我頭陪下我？💛」`, ICON_CRY, 'hinata-mood');
      pet.lastLowAlertAt.mood = hk.nowMs;
      dirty = true;
    }
  }

  // 2. Weekday school message roll (or force_test)
  const aeSm = (state.autoEvents && state.autoEvents.schoolMail) || { prob: 25, maxPerDay: 10 };
  if (!pet.dailyAutoCounts || pet.dailyAutoCounts.date !== hk.todayStr) {
    pet.dailyAutoCounts = { date: hk.todayStr, toilet: 0, konbiniAsk: 0, parkAsk: 0, backyardAsk: 0, schoolMail: 0, snackBuy: 0 };
  }
  const smCnt = pet.dailyAutoCounts.schoolMail || 0;
  const forceTest = (process.env.FORCE_TEST === 'true');
  const inSchoolHours = !isWeekend && hk.totalMin >= 530 && hk.totalMin < 1020;
  if (forceTest || (inSchoolHours && aeSm.prob > 0 && aeSm.maxPerDay > 0 && smCnt < aeSm.maxPerDay && (hk.nowMs - (pet.lastSchoolMailAt || 0) >= 30 * 60 * 1000))) {
    if (forceTest || Math.random() < (aeSm.prob / 100)) {
      const txt = SCHOOL_LETTERS[Math.floor(Math.random() * SCHOOL_LETTERS.length)];
      pet.lastSchoolMailAt = hk.nowMs;
      pet.dailyAutoCounts.schoolMail = smCnt + 1;
      if (!state.mailbox) state.mailbox = { items: [], lastMailDate: null, lastInviteDate: null, recentLetterIdxs: [] };
      if (!Array.isArray(state.mailbox.items)) state.mailbox.items = [];
      state.mailbox.lastMailDate = hk.todayStr;
      state.mailbox.items.push({ sender: 'hinata', type: 'letter', read: false, timeStr: `平日 ${hk.timeLabel}`, text: txt });
      if (state.mailbox.items.length > 20) state.mailbox.items = state.mailbox.items.slice(-20);
      await sendNotification(state, '日向翔陽傳咗訊息畀你 🏐', txt, ICON_NORMAL, 'hinata-mail');
      dirty = true;
    }
  }

  if (dirty) {
    state.savedAt = hk.nowMs;
    const patchUrl = `${DOC_URL}&updateMask.fieldPaths=payload&updateMask.fieldPaths=updatedAt`;
    const pRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          payload: { stringValue: JSON.stringify(state) },
          updatedAt: { integerValue: String(hk.nowMs) }
        }
      })
    });
    console.log('Firestore synced:', pRes.status);
  } else {
    console.log('Checked cleanly; no push triggered this run.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
