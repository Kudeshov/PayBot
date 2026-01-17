<?php
// /bot/tg_webhook.php
require_once __DIR__ . '/tg_api.php';
require_once __DIR__ . '/orders.php';
require_once __DIR__ . '/payment.php';

header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
$update = json_decode($raw, true);

if (!$update) {
  http_response_code(200);
  echo json_encode(['ok' => true, 'ignored' => 'no json']);
  exit;
}

function sendWelcome(int $chatId): void {
  $text = "👋 Добро пожаловать! Курс по ИИ за 9900₽.\n\n/buy — купить доступ в закрытую группу";
  tgApi('sendMessage', [
    'chat_id' => $chatId,
    'text' => $text,
    'reply_markup' => [
      'inline_keyboard' => [
        [['text' => '🛒 Купить курс', 'callback_data' => 'buy_course']]
      ]
    ],
  ]);
}

function sendBuy(int $chatId, int $userId): void {
  expireOldOrders();

  $order = getActiveOrderByUser($userId);
  if (!$order) $order = createOrder($userId);

  $orderId = $order['order_id'];
  $paymentUrl = buildPaymentUrl($orderId);

  $text =
    "💰 *Оплата курса \"ИИ PRO\" — 9900₽*\n\n" .
    "• Полный доступ к закрытой группе\n" .
    "• Обновления навсегда\n\n" .
    "Оплата по ссылке:\n" . $paymentUrl . "\n\n" .
    "⏱️ Срок ожидания: 30 минут";

  tgApi('sendMessage', [
    'chat_id' => $chatId,
    'text' => $text,
    'parse_mode' => 'Markdown',
    'reply_markup' => [
      'inline_keyboard' => [
        [['text' => '💳 Оплатить ЮMoney', 'url' => $paymentUrl]],
        [['text' => '🆘 Статус', 'callback_data' => 'status_cb']]
      ]
    ],
  ]);
}

function answerCallback(string $cbId, string $text): void {
  tgApi('answerCallbackQuery', [
    'callback_query_id' => $cbId,
    'text' => $text,
    'show_alert' => false,
  ]);
}

try {
  // commands
  if (isset($update['message']['text'])) {
    $chatId = (int)$update['message']['chat']['id'];
    $userId = (int)$update['message']['from']['id'];
    $text   = trim($update['message']['text']);

    if (strpos($text, '/start') === 0) {
      sendWelcome($chatId);
    } elseif (strpos($text, '/buy') === 0) {
      sendBuy($chatId, $userId);
    }
  }

  // callbacks
  if (isset($update['callback_query'])) {
    $cb = $update['callback_query'];
    $cbId = $cb['id'];
    $userId = (int)$cb['from']['id'];
    $chatId = (int)$cb['message']['chat']['id'];
    $data = $cb['data'] ?? '';

    if ($data === 'buy_course') {
      answerCallback($cbId, 'Ок, формирую ссылку...');
      sendBuy($chatId, $userId);
    } elseif ($data === 'status_cb') {
      expireOldOrders();
      $order = getActiveOrderByUser($userId);
      if ($order) {
        $code = substr($order['order_id'], -6);
        answerCallback($cbId, "Ожидаем оплату заказа {$code}...");
      } else {
        answerCallback($cbId, "Заказ не найден. Напишите /buy");
      }
    }
  }

  http_response_code(200);
  echo json_encode(['ok' => true]);
} catch (Throwable $e) {
  error_log("tg_webhook exception: " . $e->getMessage());
  http_response_code(200);
  echo json_encode(['ok' => true, 'error' => 'handled']);
}
