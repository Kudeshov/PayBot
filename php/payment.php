<?php
// /bot/payment.php
require_once __DIR__ . '/config.php';

function buildPaymentUrl(string $orderId): string {
  $params = [
    'receiver' => YOOMONEY_WALLET,
    'quickpay-form' => 'shop',
    'targets' => 'Курс по ИИ - доступ к закрытой группе',
    'paymentType' => 'PC',
    'sum' => (string)COURSE_PRICE,
    'label' => $orderId,
    'nm' => 'Курс #' . substr($orderId, -6),
  ];
  return 'https://yoomoney.ru/quickpay/confirm.xml?' . http_build_query($params);
}
