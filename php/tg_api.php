<?php
// /bot/tg_api.php
require_once __DIR__ . '/config.php';

function tgApi(string $method, array $params = []) {
  $url = 'https://api.telegram.org/bot' . BOT_TOKEN . '/' . $method;

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($params, JSON_UNESCAPED_UNICODE),
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 25,
  ]);

  $resp = curl_exec($ch);
  $err  = curl_error($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($resp === false) {
    error_log("TG API curl error: $err");
    return null;
  }

  if ($code >= 400) {
    error_log("TG API http=$code resp=$resp");
  }

  return json_decode($resp, true);
}
