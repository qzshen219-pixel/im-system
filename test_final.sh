#!/bin/bash
BASE="http://172.22.120.246:8080"

echo "=== 测试登录 ==="
curl -s --max-time 5 -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"123456"}'
echo ""

echo "=== 测试 CORS OPTIONS ==="
curl -s --max-time 5 -X OPTIONS "$BASE/api/login" \
  -H "Origin: http://172.22.120.246:8081" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
echo ""

echo "=== 测试前端页面 ==="
curl -s --max-time 5 http://172.22.120.246:8081/ | head -3
