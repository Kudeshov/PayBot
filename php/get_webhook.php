<?php
require_once __DIR__ . '/tg_api.php';
header('Content-Type: application/json; charset=utf-8');
echo json_encode(tgApi('getWebhookInfo'), JSON_UNESCAPED_UNICODE);