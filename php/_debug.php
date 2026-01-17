<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header('Content-Type: text/plain; charset=utf-8');

echo "STEP 0: php ok\n";

echo "STEP 1: require config...\n";
require __DIR__ . '/config.php';
echo "OK config\n";

echo "STEP 2: require db...\n";
require __DIR__ . '/db.php';
echo "OK db\n";

echo "STEP 3: call db()...\n";
$pdo = db();
echo "OK db() connected\n";

echo "STEP 4: SELECT 1...\n";
$r = $pdo->query("SELECT 1")->fetch();
var_dump($r);

echo "DONE\n";
