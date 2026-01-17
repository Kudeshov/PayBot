<?php
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
  $pdo = db();
  $pdo->query("SELECT 1")->fetch();
  echo json_encode([
    'status' => 'ok',
    'time' => date('c'),
    'pdo' => true,
    'curl' => function_exists('curl_init'),
  ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'status' => 'error',
    'message' => $e->getMessage(),
  ], JSON_UNESCAPED_UNICODE);
}
