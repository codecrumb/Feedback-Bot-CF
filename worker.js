// ---------- Configuration ---------- //
// Set these as environment variables in your Cloudflare Worker settings:
//   BOT_TOKEN        — Your Bot's Token (from BotFather)
//   BOT_WEBHOOK      — Path for Telegram updates (e.g. /endpoint)
//   BOT_SECRET       — Secret for webhook verification
//   OWNER_ID         — Your Telegram User ID (Admin)
//   NOTIFY_ON_START  — Set to "true" to notify you when a user sends /start

// ---------- Constants & Helpers ---------- //

const IF_TEXT = "Reference ID: {}\nFrom: {}\n\n{}";
const IF_CONTENT = "Reference ID: {}\nFrom: {}";

const HEADERS_JSON = { 'Content-Type': 'application/json' };

// ---------- Telegram API Functions ---------- //

async function api(method, params) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const response = await fetch(params ? `${url}?${new URLSearchParams(params)}` : url, {
    method: params ? 'POST' : 'GET',
    headers: params ? { 'Content-Type': 'application/json' } : undefined,
    body: params ? JSON.stringify(params) : undefined
  });

  return response.json();
}

async function getMe() {
  return api('getMe');
}

async function sendMessage(chat_id, text, reply_to_message_id = null) {
  return api('sendMessage', { chat_id, text, reply_to_message_id, parse_mode: 'Markdown' });
}

async function copyMessage(chat_id, from_chat_id, message_id, caption = null) {
  return api('copyMessage', { chat_id, from_chat_id, message_id, caption, parse_mode: 'Markdown' });
}

async function copyMediaGroup(chat_id, from_chat_id, message_id) {
  return api('copyMessage', { chat_id, from_chat_id, message_id });
}

async function sendPhoto(chatId, photo, caption = null, replyToMessageId = null) {
  return api("sendPhoto", {
    chat_id: chatId,
    photo: photo,
    caption: caption,
    parse_mode: "Markdown",
    reply_to_message_id: replyToMessageId,
  });
}

async function sendVideo(chatId, video, caption = null, replyToMessageId = null) {
  return api("sendVideo", {
    chat_id: chatId,
    video: video,
    caption: caption,
    parse_mode: "Markdown",
    reply_to_message_id: replyToMessageId,
  });
}

async function sendAudio(chatId, audio, caption = null, replyToMessageId = null) {
  return api("sendAudio", {
    chat_id: chatId,
    audio: audio,
    caption: caption,
    parse_mode: "Markdown",
    reply_to_message_id: replyToMessageId,
  });
}

async function sendDocument(chatId, document, caption = null, replyToMessageId = null) {
  return api("sendDocument", {
    chat_id: chatId,
    document: document,
    caption: caption,
    parse_mode: "Markdown",
    reply_to_message_id: replyToMessageId,
  });
}

async function sendSticker(chatId, sticker, replyToMessageId = null) {
  return api("sendSticker", {
    chat_id: chatId,
    sticker: sticker,
    reply_to_message_id: replyToMessageId,
  });
}

async function sendVoice(chatId, voice, caption = null, replyToMessageId = null) {
  return api("sendVoice", {
    chat_id: chatId,
    voice: voice,
    caption: caption,
    parse_mode: "Markdown",
    reply_to_message_id: replyToMessageId,
  });
}

async function sendVideoNote(chatId, video_note, replyToMessageId = null) {
  return api("sendVideoNote", {
    chat_id: chatId,
    video_note: video_note,
    reply_to_message_id: replyToMessageId,
  });
}

async function getUsers(user_ids) {
  const response = await api("getChat", { chat_id: user_ids });

  if (response.ok) {
    return response.result;
  } else {
    console.error("Error getting user info:", response);
    return null;
  }
}

// ---------- Webhook Handling ---------- //

async function handleWebhook(request) {
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== BOT_SECRET) {
    return new Response('Unauthorized', { status: 403 });
  }

  const update = await request.json();
  await onUpdate(update);
  return new Response('OK');
}

async function registerWebhook(request) {
  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.hostname}${BOT_WEBHOOK}`;
  const response = await api('setWebhook', {
    url: webhookUrl,
    secret_token: BOT_SECRET
  });

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
  const chatId = message.from.id;

  if (message.text === '/start') {
    await handleStart(message);
    return;
  }

  if (message.text === '/info' && message.chat.id === Number(OWNER_ID)) {
    await handleInfo(message);
    return;
  }

  if (message.text) {
    await handleTextMessage(message);
  } else if (message.media_group_id && message.photo) {
    await handleMediaGroupMessage(message);
  } else if (message.photo) {
    await handlePhotoMessage(message);
  } else if (message.video) {
    await handleVideoMessage(message);
  } else if (message.audio) {
    await handleAudioMessage(message);
  } else if (message.document) {
    await handleDocumentMessage(message);
  } else if (message.sticker) {
    await handleStickerMessage(message);
  } else if (message.voice) {
    await handleVoiceMessage(message);
  } else if (message.video_note) {
    await handleVideoNoteMessage(message);
  }
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
    await sendMessage(Number(OWNER_ID), 'Reply to a forwarded message with /info to get user details.');
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

// ---------- Text Message Handler ---------- //

async function handleTextMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    await replyText(message);
    return;
  }

  const info = await getUsers(message.from.id);
  const referenceId = message.chat.id;
  await sendMessage(Number(OWNER_ID), IF_TEXT.replace("{}", referenceId).replace("{}", info.first_name).replace("{}", message.text));
}

// ---------- Media Group Message Handler ---------- //

async function handleMediaGroupMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    await replayMedia(message);
    return;
  }

  const referenceId = message.chat.id;
  await copyMediaGroup(Number(OWNER_ID), referenceId, message.message_id);
}

// ---------- Media Message Handlers ---------- //

async function handlePhotoMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    await replayMedia(message);
    return;
  }

  const info = await getUsers(message.from.id);
  const referenceId = message.chat.id;
  let caption = IF_CONTENT.replace("{}", referenceId).replace("{}", info.first_name);
  if (message.caption) caption += `\n\n${message.caption}`;

  const fileId = message.photo[message.photo.length - 1].file_id;
  await sendPhoto(Number(OWNER_ID), fileId, caption);
}

async function handleVideoMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    await replayMedia(message);
    return;
  }

  const info = await getUsers(message.from.id);
  const referenceId = message.chat.id;
  let caption = IF_CONTENT.replace("{}", referenceId).replace("{}", info.first_name);
  if (message.caption) caption += `\n\n${message.caption}`;

  await sendVideo(Number(OWNER_ID), message.video.file_id, caption);
}

async function handleAudioMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    await replayMedia(message);
    return;
  }

  const info = await getUsers(message.from.id);
  const referenceId = message.chat.id;
  let caption = IF_CONTENT.replace("{}", referenceId).replace("{}", info.first_name);
  if (message.caption) caption += `\n\n${message.caption}`;

  await sendAudio(Number(OWNER_ID), message.audio.file_id, caption);
}

async function handleDocumentMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    await replayMedia(message);
    return;
  }

  const info = await getUsers(message.from.id);
  const referenceId = message.chat.id;
  let caption = IF_CONTENT.replace("{}", referenceId).replace("{}", info.first_name);
  if (message.caption) caption += `\n\n${message.caption}`;

  await sendDocument(Number(OWNER_ID), message.document.file_id, caption);
}

async function handleStickerMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    await replayMedia(message);
    return;
  }

  const info = await getUsers(message.from.id);
  const referenceId = message.chat.id;
  const caption = IF_CONTENT.replace("{}", referenceId).replace("{}", info.first_name);

  await sendSticker(Number(OWNER_ID), message.sticker.file_id);
}

async function handleVoiceMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    await replayMedia(message);
    return;
  }

  const info = await getUsers(message.from.id);
  const referenceId = message.chat.id;
  let caption = IF_CONTENT.replace("{}", referenceId).replace("{}", info.first_name);
  if (message.caption) caption += `\n\n${message.caption}`;

  await sendVoice(Number(OWNER_ID), message.voice.file_id, caption);
}

async function handleVideoNoteMessage(message) {
  if (message.chat.id === Number(OWNER_ID)) {
    await replayMedia(message);
    return;
  }

  const info = await getUsers(message.from.id);
  const referenceId = message.chat.id;

  await sendVideoNote(Number(OWNER_ID), message.video_note.file_id);
}

// ---------- Reply Handlers (for Owner) ---------- //

async function replyText(message) {
  if (!message.reply_to_message) return;

  const referenceId = getReferenceIdFromReply(message.reply_to_message);
  if (!referenceId) return;

  await sendMessage(referenceId, message.text);
}

async function replayMedia(message) {
  if (!message.reply_to_message) return;

  const referenceId = getReferenceIdFromReply(message.reply_to_message);
  if (!referenceId) return;

  if (message.media_group_id) {
    await copyMediaGroup(referenceId, message.chat.id, message.message_id);
  } else if (message.photo) {
    const fileId = message.photo[message.photo.length - 1].file_id;
    await sendPhoto(referenceId, fileId, message.caption, message.message_id);
  } else if (message.video) {
    await sendVideo(referenceId, message.video.file_id, message.caption, message.message_id);
  } else if (message.audio) {
    await sendAudio(referenceId, message.audio.file_id, message.caption, message.message_id);
  } else if (message.document) {
    await sendDocument(referenceId, message.document.file_id, message.caption, message.message_id);
  } else if (message.sticker) {
    await sendSticker(referenceId, message.sticker.file_id, message.message_id);
  } else if (message.voice) {
    await sendVoice(referenceId, message.voice.file_id, message.caption, message.message_id);
  } else if (message.video_note) {
    await sendVideoNote(referenceId, message.video_note.file_id, message.message_id);
  }
}

// ---------- Helper Function for Replies ---------- //

function getReferenceIdFromReply(replyToMessage) {
  let referenceId = null;
  if (replyToMessage.text) {
    const match = replyToMessage.text.match(/Reference ID: (\d+)/);
    if (match) referenceId = parseInt(match[1]);
  } else if (replyToMessage.caption) {
    const match = replyToMessage.caption.match(/Reference ID: (\d+)/);
    if (match) referenceId = parseInt(match[1]);
  }
  return referenceId;
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
