<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/tg_api.php';

header('Content-Type: application/json; charset=utf-8');

$webhookUrl = BASE_URL . BOT_PATH . '/tg_webhook.php';
$res = tgApi('setWebhook', ['url' => $webhookUrl]);

echo json_encode([
  'webhook' => $webhookUrl,
  'response' => $res,
], JSON_UNESCAPED_UNICODE);
