const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set, push } = require('firebase/database');

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

function getRole(status) {
  const map = {
    creator: 'owner', administrator: 'admin', member: 'member',
    restricted: 'restricted', left: 'left', kicked: 'banned',
  };
  return map[status] || status;
}

function formatUser(user, status = null) {
  const username = user.username ? `@${user.username}` : 'không có';
  const link = user.username
    ? `<a href="https://t.me/${user.username}">link</a>`
    : `<a href="tg://user?id=${user.id}">link</a>`;

  let text = `User info:\n`;
  text += `ID: <code>${user.id}</code>\n`;
  text += `First Name: ${user.first_name || ''}`;
  if (user.last_name) text += `\nLast Name: ${user.last_name}`;
  text += `\nUsername: ${username}\n`;
  text += `User link: ${link}`;
  if (status) text += `\nStatus: ${getRole(status)}`;

  return text;
}

async function getMemberStatus(chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return member.status;
  } catch { return null; }
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
  await trackUser(msg);
  if (!msg.text) return;

  if (msg.text.startsWith('/info')) {
    let targetUser = null, status = null;

    if (msg.reply_to_message) {
      targetUser = msg.reply_to_message.from;
      status = await getMemberStatus(msg.chat.id, targetUser.id);
    } else {
      const arg = msg.text.split(' ')[1];
      if (arg) {
        const username = arg.replace('@', '').toLowerCase();
        const snap = await get(ref(db, 'bot_users'));
        if (snap.exists()) {
          const found = Object.values(snap.val()).find(
            u => u.username && u.username.toLowerCase() === username
          );
          if (found) {
            targetUser = found;
            status = await getMemberStatus(msg.chat.id, found.id);
          } else {
            return bot.sendMessage(msg.chat.id, 'Không tìm thấy user. User cần nhắn tin trong nhóm trước.');
          }
        }
      } else {
        targetUser = msg.from;
        status = await getMemberStatus(msg.chat.id, msg.from.id);
      }
    }

    if (!targetUser) return;
    bot.sendMessage(msg.chat.id, formatUser(targetUser, status), {
      parse_mode: 'HTML', reply_to_message_id: msg.message_id,
    });
  }
});

bot.on('new_chat_members', async (msg) => {
  for (const user of msg.new_chat_members) {
    if (!user.is_bot) await trackUser({ ...msg, from: user });
  }
});

console.log('Bot dang chay...');
