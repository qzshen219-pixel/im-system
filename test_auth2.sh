#!/bin/bash
BASE="http://127.0.0.1:8080"

echo "=== 1. 注册用户 test1 ==="
curl -s --max-time 5 -X POST "$BASE/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"123456","nickname":"测试用户1"}'
echo ""

echo "=== 2. 注册用户 test2 ==="
curl -s --max-time 5 -X POST "$BASE/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"test2","password":"123456","nickname":"测试用户2"}'
echo ""

echo "=== 3. 登录 test1 ==="
LOGIN1=$(curl -s --max-time 5 -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"123456"}')
echo "$LOGIN1"
TOKEN1=$(echo "$LOGIN1" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
USER1_ID=$(echo "$LOGIN1" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "token=$TOKEN1 user_id=$USER1_ID"

echo ""
echo "=== 4. 登录 test2 ==="
LOGIN2=$(curl -s --max-time 5 -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test2","password":"123456"}')
echo "$LOGIN2"
TOKEN2=$(echo "$LOGIN2" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
USER2_ID=$(echo "$LOGIN2" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "token=$TOKEN2 user_id=$USER2_ID"

echo ""
echo "=== 5. 测试错误密码登录 ==="
curl -s --max-time 5 -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"wrongpassword"}'
echo ""

echo "=== 6. 测试重复注册 ==="
curl -s --max-time 5 -X POST "$BASE/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"123456","nickname":"重复用户"}'
echo ""

echo "=== 7. 获取好友列表 ==="
curl -s --max-time 5 "$BASE/api/friends?user_id=$USER1_ID"
echo ""

echo "=== 8. 获取会话列表 ==="
curl -s --max-time 5 "$BASE/api/conversations?user_id=$USER1_ID"
echo ""
