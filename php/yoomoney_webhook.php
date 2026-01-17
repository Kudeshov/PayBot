<?php
// /bot/yoomoney_webhook.php
require_once __DIR__ . '/tg_api.php';
require_once __DIR__ . '/orders.php';

header('Content-Type: text/plain; charset=utf-8');

$params = $_POST ?: [];
error_log('Yoomoney notify: ' . json_encode($params, JSON_UNESCAPED_UNICODE));

// подпись
$strForHash = implode('&', [
  $params['notification_type'] ?? '',
  $params['operation_id'] ?? '',
  $params['amount'] ?? '',
  $params['currency'] ?? '',
  $params['datetime'] ?? '',
  $params['sender'] ?? '',
  $params['codepro'] ?? '',
  WEBHOOK_SECRET,
  $params['label'] ?? '',
]);

$calculated = sha1($strForHash);
$received   = strtolower($params['sha1_hash'] ?? '');

if (!$received || $calculated !== $received) {
  error_log("Bad signature. calc=$calculated got=$received");
  http_response_code(400);
  echo "Bad signature";
  exit;
}

// только входящие
$nt = $params['notification_type'] ?? '';
if (!in_array($nt, ['card-incoming', 'p2p-incoming'], true)) {
  http_response_code(200);
  echo "OK";
  exit;
}

$label = $params['label'] ?? '';
$paidAmount = (float)($params['withdraw_amount'] ?? $params['amount'] ?? 0);

if (!$label || $paidAmount < COURSE_PRICE) {
  error_log("Not enough amount or no label. label=$label amount=$paidAmount");
  http_response_code(200);
  echo "OK";
  exit;
}

$order = getPendingOrderById($label);
if (!$order) {
  error_log("Order not found or not pending: $label");
  http_response_code(200);
  echo "OK";
  exit;
}

$userId = (int)$order['user_id'];

// помечаем paid до выдачи доступа
markOrderPaid($label);

// выдаём доступ
tgApi('unbanChatMember', [
  'chat_id' => GROUP_CHAT_ID,
  'user_id' => $userId,
  'only_if_banned' => true,
]);

tgApi('restrictChatMember', [
  'chat_id' => GROUP_CHAT_ID,
  'user_id' => $userId,
  'permissions' => [
    'can_send_messages' => true,
    'can_send_media_messages' => true,
    'can_send_polls' => true,
    'can_send_other_messages' => true,
    'can_add_web_page_previews' => true,
  ],
]);

$invite = tgApi('exportChatInviteLink', ['chat_id' => GROUP_CHAT_ID]);
$inviteLink = $invite['result'] ?? null;

$msg =
  "🎉 *Оплата прошла успешно!*\n\n" .
  "Добро пожаловать в закрытую группу курса по ИИ:\n" .
  ($inviteLink ? $inviteLink : "Ссылка недоступна, напишите /start") . "\n\n" .
  "Сохраните ссылку — она работает всегда.\n" .
  "Удачного обучения! 🚀";

tgApi('sendMessage', [
  'chat_id' => $userId,
  'text' => $msg,
  'parse_mode' => 'Markdown',
]);

http_response_code(200);
echo "OK";
