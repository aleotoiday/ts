const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set, push } = require('firebase/database');
const http = require('http');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const firebaseApp = initializeApp({
  apiKey: "AIzaSyBg-69cYKw9ZWZ29zrAzccL3g4NLNXE2Qk",
  authDomain: "mi-xao-bo.firebaseapp.com",
  databaseURL: "https://mi-xao-bo-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mi-xao-bo",
  storageBucket: "mi-xao-bo.firebasestorage.app",
  messagingSenderId: "936795695927",
  appId: "1:936795695927:web:8b93f30c92ea2c44f608b2",
});

const db = getDatabase(firebaseApp);

async function getUser(uid) {
  const snap = await get(ref(db, `bot_users/${uid}`));
  return snap.exists() ? snap.val() : null;
}

async function saveUser(uid, data) {
  await set(ref(db, `bot_users/${uid}`), data);
}

async function pushHistory(uid, entry) {
  await push(ref(db, `bot_users/${uid}/username_history`), entry);
}

function formatUser(user) {
  const username = user.username ? `@${user.username}` : 'không có';
  const link = user.username
    ? `<a href="https://t.me/${user.username}">link</a>`
    : `<a href="tg://user?id=${user.id}">link</a>`;

  let text = `<b>User info:</b>\n`;
  text += `ID: <code>${user.id}</code>\n`;
  text += `First Name: ${user.first_name || ''}`;
  if (user.last_name) text += `\nLast Name: ${user.last_name}`;
  text += `\nUsername: ${username}\n`;
  text += `User link: ${link}`;

  return text;
}

async function trackUser(msg) {
  const user = msg.from;
  if (!user || user.is_bot) return;

  const uid = String(user.id);
  const now = new Date().toISOString();
  const stored = await getUser(uid);
  const newUsername = user.username || null;
  const oldUsername = stored?.username ?? null;

  if (!stored) {
    await saveUser(uid, {
      id: user.id, first_name: user.first_name,
      last_name: user.last_name || null, username: newUsername,
      username_history: [], seen_at: now, last_seen: now,
    });
    return;
  }

  if (oldUsername !== newUsername) {
    await pushHistory(uid, { old: oldUsername, new: newUsername, changed_at: now });

    const nameDisplay = [user.first_name, user.last_name].filter(Boolean).join(' ');
    const notice =
      `Username thay đổi\n` +
      `Người dùng: <a href="tg://user?id=${user.id}">${nameDisplay}</a>\n` +
      `ID: <code>${user.id}</code>\n` +
      `Trước: ${oldUsername ? `@${oldUsername}` : 'không có'}\n` +
      `Sau: ${newUsername ? `@${newUsername}` : 'không có'}`;

    bot.sendMessage(msg.chat.id, notice, { parse_mode: 'HTML' });
  }

  await saveUser(uid, {
    ...stored, first_name: user.first_name,
    last_name: user.last_name || null, username: newUsername, last_seen: now,
  });
}

bot.on('message', async (msg) => {
  const chatType = msg.chat.type;
  if (chatType === 'private') {
    return bot.sendMessage(msg.chat.id, 'Bot chỉ hoạt động trên nhóm.');
  }
  if (chatType !== 'group' && chatType !== 'supergroup') return;

  try { await trackUser(msg); } catch {}

  if (!msg.text) return;

  const text = msg.text.split('@')[0].trim();

  // /info
  if (text.startsWith('/info')) {
    let targetUser = null;

    if (msg.reply_to_message) {
      targetUser = msg.reply_to_message.from;
    } else {
      const arg = text.split(' ')[1];
      if (arg) {
        const username = arg.replace('@', '').toLowerCase();
        const snap = await get(ref(db, 'bot_users'));
        if (snap.exists()) {
          const found = Object.values(snap.val()).find(
            u => u.username && u.username.toLowerCase() === username
          );
          if (found) {
            targetUser = found;
          } else {
            return bot.sendMessage(msg.chat.id, 'Không tìm thấy user. User cần nhắn tin trong nhóm trước.');
          }
        }
      } else {
        targetUser = msg.from;
      }
    }

    if (!targetUser) return;
    bot.sendMessage(msg.chat.id, formatUser(targetUser), {
      parse_mode: 'HTML', reply_to_message_id: msg.message_id,
    });
  }

  // /id
  if (text.startsWith('/id')) {
    const chatId = msg.chat.id;
    const chatTitle = msg.chat.title || 'không có tên';
    bot.sendMessage(msg.chat.id, `<b>Group info:</b>\nName: ${chatTitle}\nID: <code>${chatId}</code>`, {
      parse_mode: 'HTML', reply_to_message_id: msg.message_id,
    });
  }
});

bot.on('new_chat_members', async (msg) => {
  const chatType = msg.chat.type;
  if (chatType !== 'group' && chatType !== 'supergroup') return;

  for (const user of msg.new_chat_members) {
    if (!user.is_bot) await trackUser({ ...msg, from: user });
  }
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
});

server.listen(3000, () => {
  console.log('Web server ready for ping on port 3000');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('Port 3000 busy, skipping keep-alive server.');
  }
});

console.log('Bot dang chay...');
