#!/bin/bash
BASE="http://172.22.120.246:8080"

echo "=== 测试登录 ==="
curl -s --max-time 5 -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"123456"}'
echo ""

echo "=== 测试注册 ==="
curl -s --max-time 5 -X POST "$BASE/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"test4","password":"123456","nickname":"测试用户4"}'
echo ""
