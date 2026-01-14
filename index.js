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
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// ВРЕМЕННОЕ хранилище заказов (userId → orderId). В проде → Redis/PostgreSQL
const pendingOrders = new Map();

// ===== БОТ ЛОГИКА =====
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  await ctx.reply('👋 Добро пожаловать! Курс по ИИ за 9900₽.\n\n/buy — купить доступ', 
    Markup.inlineKeyboard([[Markup.button.url('🛒 Купить курс', 't.me/testpipay_bot?start=buy')]]));
});

bot.command('buy', async (ctx) => {
  const userId = ctx.from.id;
  const orderId = `order_${Date.now()}_${userId}_${Math.floor(Math.random()*1000)}`;
  
  // Сохраняем заказ
  pendingOrders.set(userId, { orderId, amount: 9900, timestamp: Date.now() });
  
  // Генерируем ссылку ЮMoney
  const paymentUrl = new URL('https://yoomoney.ru/quickpay/confirm.xml');
  paymentUrl.searchParams.set('receiver', YOOMONEY_WALLET);
  paymentUrl.searchParams.set('quickpay-form', 'shop');
  paymentUrl.searchParams.set('targets', 'Курс по ИИ - доступ к закрытой группе');
  paymentUrl.searchParams.set('paymentType', 'PC');
  paymentUrl.searchParams.set('sum', '9900');
  paymentUrl.searchParams.set('label', orderId);  // КРИТИЧНО для идентификации
  paymentUrl.searchParams.set('nm', `Курс #${orderId.slice(-6)}`);

  await ctx.replyWithHTML(
    `💰 <b>Оплата курса "ИИ PRO" — 9900₽</b>\n\n` +
    `• Полный доступ к закрытой группе\n` +
    `• Обновления навсегда\n\n` +
    `<a href="${paymentUrl.toString()}">Нажми для оплаты</a>\n\n` +
    `⏱️ Срок ожидания: 30 минут`,
    Markup.inlineKeyboard([
      [Markup.button.url('💳 Оплатить ЮMoney', paymentUrl.toString())],
      [Markup.button.text('🆘 Статус', 'status_cb')]
    ])
  );
});

// Callback для статуса
bot.action('status_cb', async (ctx) => {
  const userId = ctx.from.id;
  const order = pendingOrders.get(userId);
  if (order) {
    await ctx.answerCbQuery(`Ожидаем оплату заказа ${order.orderId.slice(-6)}...`);
  } else {
    await ctx.answerCbQuery('Заказ не найден. Напишите /buy');
  }
});

// Очистка старых заказов (каждые 5 мин)
setInterval(() => {
  const now = Date.now();
  for (const [userId, order] of pendingOrders) {
    if (now - order.timestamp > 30 * 60 * 1000) { // 30 мин
      pendingOrders.delete(userId);
      console.log(`Удалён старый заказ ${order.orderId}`);
    }
  }
}, 5 * 60 * 1000);

// ===== ЮMONEY WEBHOOK =====
app.post('/yoomoney-webhook', (req, res) => {
  const params = req.body;
  console.log('📥 ЮMoney уведомление:', params.notification_type, params.label);

  // 1. Проверяем подпись (КРИТИЧНО!)
  const fields = [
    params.notification_type || '',
    params.operation_id || '',
    params.amount || '',
    params.currency || '',
    params.datetime || '',
    params.sender || '',
    params.codepro || '',
    WEBHOOK_SECRET || '',
    params.label || ''
  ];
  const strForHash = fields.filter(Boolean).join('&');
  const calculatedHash = crypto.createHmac('sha256', WEBHOOK_SECRET).update(strForHash).digest('hex');

  if (calculatedHash !== params.sha1_hash) {
    console.error('❌ Неверная подпись:', calculatedHash, '!=', params.sha1_hash);
    return res.status(400).send('Bad signature');
  }

  // 2. Только успешные платежи
  if (!['card-incoming', 'p2p-incoming'].includes(params.notification_type)) {
    console.log('⏭️ Пропускаем:', params.notification_type);
    return res.sendStatus(200);
  }

  const label = params.label;
  const paidAmount = parseFloat(params.withdraw_amount || params.amount);
  
  if (!label || paidAmount < 9900) {
    console.log('❌ Недостаточная сумма или нет label:', paidAmount, label);
    return res.sendStatus(200);
  }

  // 3. Ищем пользователя по orderId (label)
  let foundUser = null;
  for (const [userId, order] of pendingOrders.entries()) {
    if (order.orderId === label) {
      foundUser = userId;
      break;
    }
  }

  if (!foundUser) {
    console.log('❌ Пользователь не найден по label:', label);
    return res.sendStatus(200);
  }

  // 4. ВЫДАЧА ДОСТУПА
  console.log(`✅ Оплата ${label} от user ${foundUser} — выдаём доступ`);
  
  Promise.resolve()
    // Разбаниваем (если был забанен)
    .then(() => bot.telegram.unbanChatMember(GROUP_ID, foundUser))
    // Даём права участника
    .then(() => bot.telegram.restrictChatMember(GROUP_ID, foundUser, {
      permissions: {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true
      }
    }))
    // Генерируем уникальную ссылку-приглашение
    .then(() => bot.telegram.exportChatInviteLink(GROUP_ID))
    .then((inviteLink) => {
      // Отправляем пользователю
      return bot.telegram.sendMessage(foundUser, 
        `🎉 *Оплата прошла успешно!*\n\n` +
        `Добро пожаловать в закрытую группу курса по ИИ:\n` +
        `${inviteLink}\n\n` +
        `Сохраните ссылку — она работает всегда.\n` +
        `Удачного обучения! 🚀`,
        { parse_mode: 'Markdown' }
      );
    })
    .then(() => {
      pendingOrders.delete(foundUser);
      console.log(`✅ Доступ выдан user ${foundUser}`);
    })
    .catch((err) => {
      console.error('💥 Ошибка выдачи доступа:', err.message);
      bot.telegram.sendMessage(foundUser, '✅ Оплата прошла! Напишите /start в @testpipay_bot для получения ссылки.');
    });

  res.sendStatus(200);
});

// Health-check (для мониторинга)
app.get('/', (req, res) => res.send('Bot OK'));

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер на http://localhost:${PORT}`);
  console.log(`📡 Webhook ЮMoney: ${process.env.BASE_URL}/yoomoney-webhook`);
  console.log(`👥 Группа: ${GROUP_ID}`);
  
  // Устанавливаем webhook для бота (опционально, polling работает без)
  bot.launch().then(() => {
    console.log('🤖 Бот запущен (polling mode)');
  });
});

// Простой health-check
app.get('/health', (req, res) => {
  const status = {
    status: 'ok',
    uptime: process.uptime().toFixed(0) + ' сек',
    timestamp: new Date().toISOString(),
    bot: bot.botInfo ? 'connected' : 'initializing',
    memory: (process.memoryUsage().rss / 1024 / 1024).toFixed(1) + ' MB'
  };
  
  res.json(status);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));