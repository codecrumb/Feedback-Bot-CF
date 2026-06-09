// ---------- Configuration ---------- //
// Set these as environment variables in your Cloudflare Worker settings:
//   BOT_TOKEN        — Your Bot's Token (from BotFather)
//   BOT_WEBHOOK      — Path for Telegram updates (e.g. /endpoint)
//   BOT_SECRET       — Secret for webhook verification
//   OWNER_ID         — Your Telegram User ID or Group Chat ID (admin inbox)
//   NOTIFY_ON_START  — Set to "true" to notify you when a user sends /start

// ---------- Constants ---------- //

const HEADERS_JSON = { 'Content-Type': 'application/json' };

// ---------- Telegram API ---------- //

async function api(method, params) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const response = await fetch(params ? `${url}?${new URLSearchParams(params)}` : url, {
    method: params ? 'POST' : 'GET',
    headers: params ? { 'Content-Type': 'application/json' } : undefined,
    body: params ? JSON.stringify(params) : undefined
  });
  return response.json();
}

async function sendMessage(chat_id, text, reply_to_message_id = null) {
  return api('sendMessage', { chat_id, text, reply_to_message_id, parse_mode: 'Markdown' });
}

async function forwardMessage(chat_id, from_chat_id, message_id) {
  return api('forwardMessage', { chat_id, from_chat_id, message_id });
}

async function copyMessage(chat_id, from_chat_id, message_id) {
  return api('copyMessage', { chat_id, from_chat_id, message_id });
}

async function getUsers(chat_id) {
  const response = await api('getChat', { chat_id });
  return response.ok ? response.result : null;
}

// ---------- Webhook Handling ---------- //

async function handleWebhook(request) {
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== BOT_SECRET) {
    return new Response('Unauthorized', { status: 403 });
  }
  try {
    const update = await request.json();
    await onUpdate(update);
  } catch (e) {
    console.error('Unhandled error in onUpdate:', e?.stack ?? e);
  }
  return new Response('OK');
}

async function registerWebhook(request) {
  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.hostname}${BOT_WEBHOOK}`;
  const response = await api('setWebhook', { url: webhookUrl, secret_token: BOT_SECRET });
  return new Response(JSON.stringify(response), { headers: HEADERS_JSON });
}

async function unregisterWebhook() {
  const response = await api('setWebhook', { url: '' });
  return new Response(JSON.stringify(response), { headers: HEADERS_JSON });
}

// ---------- Update Handler ---------- //

async function onUpdate(update) {
  if (update.message) {
    await onMessage(update.message);
  }
}

// ---------- Message Handler ---------- //

async function onMessage(message) {
  if (message.text === '/start') {
    await handleStart(message);
    return;
  }

  if (message.text === '/info' && message.chat.id === Number(OWNER_ID)) {
    await handleInfo(message);
    return;
  }

  await handleMessage(message);
}

// ---------- Start Handler ---------- //

async function handleStart(message) {
  await sendMessage(message.from.id, "Hello! Send me a message and I'll forward it.");

  if (NOTIFY_ON_START === 'true') {
    const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ');
    await sendMessage(Number(OWNER_ID), `[${name}](tg://user?id=${message.from.id}) started the bot.`);
  }
}

// ---------- Info Handler ---------- //

async function handleInfo(message) {
  if (!message.reply_to_message) {
    await sendMessage(Number(OWNER_ID), 'Reply to a reference message with /info to get user details.');
    return;
  }

  const referenceId = getReferenceIdFromReply(message.reply_to_message);
  if (!referenceId) {
    await sendMessage(Number(OWNER_ID), 'Could not find a Reference ID in that message.');
    return;
  }

  const info = await getUsers(referenceId);
  if (!info) {
    await sendMessage(Number(OWNER_ID), 'Could not fetch user info.');
    return;
  }

  const name = [info.first_name, info.last_name].filter(Boolean).join(' ');
  const username = info.username ? `@${info.username}` : 'no username';
  await sendMessage(Number(OWNER_ID), `*Name:* [${name}](tg://user?id=${referenceId})\n*ID:* \`${referenceId}\`\n*Username:* ${username}`);
}

// ---------- Main Message Handler ---------- //

async function handleMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    if (!message.reply_to_message) return;
    const referenceId = getReferenceIdFromReply(message.reply_to_message);
    if (!referenceId) return;
    await copyMessage(referenceId, message.chat.id, message.message_id);
    return;
  }

  const fwd = await forwardMessage(Number(OWNER_ID), message.chat.id, message.message_id);
  const sentMessage = fwd.ok ? fwd : await copyMessage(Number(OWNER_ID), message.chat.id, message.message_id);
  if (sentMessage.ok) {
    await sendMessage(
      Number(OWNER_ID),
      `Reference ID: ${message.chat.id}\n[${message.from.first_name}](tg://user?id=${message.from.id})`,
      sentMessage.result.message_id
    );
  }
}

// ---------- Helper ---------- //

function getReferenceIdFromReply(replyToMessage) {
  const text = replyToMessage.text || replyToMessage.caption || '';
  const match = text.match(/Reference ID: (\d+)/);
  return match ? parseInt(match[1]) : null;
}

// ---------- Event Listener ---------- //

addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname === BOT_WEBHOOK) {
    event.respondWith(handleWebhook(request));
  } else if (url.pathname === '/register') {
    event.respondWith(registerWebhook(request));
  } else if (url.pathname === '/unregister') {
    event.respondWith(unregisterWebhook());
  } else {
    event.respondWith(new Response('Not Found', { status: 404 }));
  }
});
