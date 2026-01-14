require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const bot = new Telegraf(process.env.BOT_TOKEN);
const GROUP_ID = process.env.GROUP_CHAT_ID;
const YOOMONEY_WALLET = process.env.YOOMONEY_WALLET;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

// Временное хранилище заказов (userId → {orderId, amount, timestamp})
const pendingOrders = new Map();

// ===== БОТ ЛОГИКА =====
bot.start(async (ctx) => {
  await ctx.reply(
    '👋 Добро пожаловать! Курс по ИИ за 9900₽.\n\n' +
    '/buy — купить доступ в закрытую группу',
    Markup.inlineKeyboard([
      [Markup.button.callback('🛒 Купить курс', 'buy_course')]
    ])
  );
});

bot.command('buy', async (ctx) => buyCourse(ctx));

bot.action('buy_course', async (ctx) => {
  await ctx.answerCbQuery();
  await buyCourse(ctx);
});

async function buyCourse(ctx) {
  const userId = ctx.from.id;
  const orderId = `order_${Date.now()}_${userId}_${Math.floor(Math.random() * 1000)}`;

  pendingOrders.set(userId, { orderId, amount: 9900, timestamp: Date.now() });

  const paymentUrl = new URL('https://yoomoney.ru/quickpay/confirm.xml');
  paymentUrl.searchParams.set('receiver', YOOMONEY_WALLET);
  paymentUrl.searchParams.set('quickpay-form', 'shop');
  paymentUrl.searchParams.set('targets', 'Курс по ИИ - доступ к закрытой группе');
  paymentUrl.searchParams.set('paymentType', 'PC');
  paymentUrl.searchParams.set('sum', '9900');
  paymentUrl.searchParams.set('label', orderId);
  paymentUrl.searchParams.set('nm', `Курс #${orderId.slice(-6)}`);

  await ctx.replyWithHTML(
    `💰 <b>Оплата курса "ИИ PRO" — 9900₽</b>\n\n` +
    `• Полный доступ к закрытой группе\n` +
    `• Обновления навсегда\n\n` +
    `<a href="${paymentUrl.toString()}">Нажми для оплаты</a>\n\n` +
    `⏱️ Срок ожидания: 30 минут`,
    Markup.inlineKeyboard([
      [Markup.button.url('💳 Оплатить ЮMoney', paymentUrl.toString())],
      [Markup.button.callback('🆘 Статус', 'status_cb')]
    ])
  );
}

bot.action('status_cb', async (ctx) => {
  const userId = ctx.from.id;
  const order = pendingOrders.get(userId);
  await ctx.answerCbQuery(
    order
      ? `Ожидаем оплату заказа ${order.orderId.slice(-6)}...`
      : 'Заказ не найден. Напишите /buy'
  );
});

// Очистка старых заказов (каждые 5 минут)
setInterval(() => {
  const now = Date.now();
  for (const [userId, order] of pendingOrders.entries()) {
    if (now - order.timestamp > 30 * 60 * 1000) { // 30 минут
      pendingOrders.delete(userId);
      console.log(`Удалён просроченный заказ ${order.orderId}`);
    }
  }
}, 5 * 60 * 1000);

// ===== ЮMONEY WEBHOOK =====
app.post('/yoomoney-webhook', (req, res) => {
  const params = req.body;
  console.log('📥 ЮMoney уведомление:', params);

  // Правильная строка для подписи (ЮMoney использует SHA-1)
  const strForHash = [
    params.notification_type || '',
    params.operation_id || '',
    params.amount || '',
    params.currency || '',
    params.datetime || '',
    params.sender || '',
    params.codepro || '',
    WEBHOOK_SECRET,
    params.label || ''
  ].join('&');

  const calculatedHash = crypto
    .createHash('sha1')
    .update(strForHash)
    .digest('hex');

  console.log('Calculated hash:', calculatedHash);
  console.log('Received sha1_hash:', params.sha1_hash);

  if (calculatedHash !== params.sha1_hash) {
    console.error('❌ Неверная подпись');
    return res.status(400).send('Bad signature');
  }

  // Обрабатываем только успешные входящие переводы
  if (!['card-incoming', 'p2p-incoming'].includes(params.notification_type)) {
    return res.sendStatus(200);
  }

  const label = params.label;
  const paidAmount = parseFloat(params.withdraw_amount || params.amount || 0);

  if (!label || paidAmount < 9900) {
    console.log('Недостаточно денег или нет label');
    return res.sendStatus(200);
  }

  let foundUser = null;
  for (const [userId, order] of pendingOrders.entries()) {
    if (order.orderId === label) {
      foundUser = userId;
      break;
    }
  }

  if (!foundUser) {
    console.log('Пользователь не найден по label:', label);
    return res.sendStatus(200);
  }

  // Выдача доступа
  console.log(`✅ Успешная оплата ${label} → выдаём доступ пользователю ${foundUser}`);

  bot.telegram
    .unbanChatMember(GROUP_ID, foundUser, { only_if_banned: true })
    .catch(() => {}) // игнорируем если не был забанен
    .then(() =>
      bot.telegram.restrictChatMember(GROUP_ID, foundUser, {
        permissions: {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        },
      })
    )
    .then(() => bot.telegram.exportChatInviteLink(GROUP_ID))
    .then((inviteLink) =>
      bot.telegram.sendMessage(
        foundUser,
        `🎉 *Оплата прошла успешно!*\n\n` +
          `Добро пожаловать в закрытую группу курса по ИИ:\n${inviteLink}\n\n` +
          `Сохраните ссылку — она работает всегда.\n` +
          `Удачного обучения! 🚀`,
        { parse_mode: 'Markdown' }
      )
    )
    .then(() => {
      pendingOrders.delete(foundUser);
      console.log(`Доступ выдан пользователю ${foundUser}`);
    })
    .catch((err) => {
      console.error('Ошибка выдачи доступа:', err.message);
      bot.telegram.sendMessage(
        foundUser,
        '✅ Оплата прошла! Напиши /start в боте для получения ссылки.'
      );
    });

  res.sendStatus(200);
});

// ===== ПРОСТЫЕ РОУТЫ =====
app.get('/', (req, res) => res.send('Bot OK'));
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()) + ' сек',
    timestamp: new Date().toISOString(),
    bot: bot.botInfo ? 'connected' : 'initializing',
    memory: (process.memoryUsage().rss / 1024 / 1024).toFixed(1) + ' MB',
  });
});

// ===== ЗАПУСК WEBHOOK =====
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = '/tg-webhook';

bot.telegram
  .deleteWebhook({ drop_pending_updates: true })
  .then(() => {
    const webhookUrl = `${process.env.BASE_URL}${WEBHOOK_PATH}`;
    return bot.telegram.setWebhook(webhookUrl);
  })
  .then(() => {
    console.log(`Webhook успешно установлен: ${process.env.BASE_URL}${WEBHOOK_PATH}`);
  })
  .catch((err) => {
    console.error('Ошибка установки webhook:', err);
  });

// Подключаем Telegraf к express
app.use(bot.webhookCallback(WEBHOOK_PATH));

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`BASE_URL: ${process.env.BASE_URL}`);
  console.log(`ЮMoney webhook: ${process.env.BASE_URL}/yoomoney-webhook`);
  console.log(`Группа: ${GROUP_ID}`);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));