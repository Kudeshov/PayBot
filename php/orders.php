<?php
// /bot/orders.php
require_once __DIR__ . '/db.php';

function expireOldOrders(): void {
  $pdo = db();
  $pdo->exec("
    UPDATE pending_orders
    SET status='expired', updated_at=NOW()
    WHERE status='pending' AND created_at < (NOW() - INTERVAL 30 MINUTE)
  ");
}

function createOrder(int $userId): array {
  $orderId = 'order_' . time() . '_' . $userId . '_' . random_int(100, 999);
  $pdo = db();
  $now = date('Y-m-d H:i:s');

  $stmt = $pdo->prepare("
    INSERT INTO pending_orders (user_id, order_id, amount, status, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  ");
  $stmt->execute([$userId, $orderId, COURSE_PRICE, $now, $now]);

  return ['order_id' => $orderId, 'amount' => COURSE_PRICE];
}

function getActiveOrderByUser(int $userId): ?array {
  $pdo = db();
  $stmt = $pdo->prepare("
    SELECT * FROM pending_orders
    WHERE user_id = ? AND status='pending'
      AND created_at >= (NOW() - INTERVAL 30 MINUTE)
    ORDER BY id DESC
    LIMIT 1
  ");
  $stmt->execute([$userId]);
  $row = $stmt->fetch();
  return $row ?: null;
}

function getPendingOrderById(string $orderId): ?array {
  $pdo = db();
  $stmt = $pdo->prepare("SELECT * FROM pending_orders WHERE order_id=? AND status='pending' LIMIT 1");
  $stmt->execute([$orderId]);
  $row = $stmt->fetch();
  return $row ?: null;
}

function markOrderPaid(string $orderId): void {
  $pdo = db();
  $stmt = $pdo->prepare("UPDATE pending_orders SET status='paid', updated_at=NOW() WHERE order_id=?");
  $stmt->execute([$orderId]);
}
