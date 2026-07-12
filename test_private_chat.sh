#!/bin/bash
API_URL="http://172.22.120.246:8080"

echo "=========================================="
echo "  私聊功能测试"
echo "=========================================="

echo ""
echo "=== 1. 注册用户 ==="
curl -s --max-time 5 -X POST "$API_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"123456","nickname":"Alice"}'
echo ""

curl -s --max-time 5 -X POST "$API_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"123456","nickname":"Bob"}'
echo ""

echo ""
echo "=== 2. 登录 ==="
LOGIN_ALICE=$(curl -s --max-time 5 -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"123456"}')
echo "Alice: $LOGIN_ALICE"
ALICE_ID=$(echo "$LOGIN_ALICE" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

LOGIN_BOB=$(curl -s --max-time 5 -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"123456"}')
echo "Bob: $LOGIN_BOB"
BOB_ID=$(echo "$LOGIN_BOB" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

echo ""
echo "=== 3. 获取好友列表 ==="
echo "Alice的好友:"
curl -s --max-time 5 "$API_URL/api/friends?user_id=$ALICE_ID"
echo ""

echo "Bob的好友:"
curl -s --max-time 5 "$API_URL/api/friends?user_id=$BOB_ID"
echo ""

echo ""
echo "=== 4. 获取会话列表 ==="
echo "Alice的会话:"
curl -s --max-time 5 "$API_URL/api/conversations?user_id=$ALICE_ID"
echo ""

echo "Bob的会话:"
curl -s --max-time 5 "$API_URL/api/conversations?user_id=$BOB_ID"
echo ""

echo ""
echo "=========================================="
echo "  测试完成！"
echo "=========================================="
echo ""
echo "测试账号: alice/123456, bob/123456"
echo ""
echo "请在浏览器中操作："
echo "1. 打开 2 个标签页访问 http://172.22.120.246:8081"
echo "2. 标签页1: 用 alice 登录"
echo "3. 标签页2: 用 bob 登录"
echo "4. 在右侧联系人面板点击对方名字开始私聊"
echo "5. 互相发送消息测试"
