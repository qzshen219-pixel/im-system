#!/bin/bash
WS_URL="ws://172.22.120.246:8001"
API_URL="http://172.22.120.246:8080"

echo "=========================================="
echo "  群聊功能测试"
echo "=========================================="

echo ""
echo "=== 1. 注册测试用户 ==="
curl -s --max-time 5 -X POST "$API_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"user_a","password":"123456","nickname":"用户A"}'
echo ""

curl -s --max-time 5 -X POST "$API_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"user_b","password":"123456","nickname":"用户B"}'
echo ""

curl -s --max-time 5 -X POST "$API_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"user_c","password":"123456","nickname":"用户C"}'
echo ""

echo ""
echo "=== 2. 登录测试 ==="
LOGIN_A=$(curl -s --max-time 5 -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"user_a","password":"123456"}')
echo "用户A: $LOGIN_A"
TOKEN_A=$(echo "$LOGIN_A" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
USER_A_ID=$(echo "$LOGIN_A" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "Token: $TOKEN_A, ID: $USER_A_ID"

LOGIN_B=$(curl -s --max-time 5 -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"user_b","password":"123456"}')
echo "用户B: $LOGIN_B"
TOKEN_B=$(echo "$LOGIN_B" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
USER_B_ID=$(echo "$LOGIN_B" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f4)
echo "Token: $TOKEN_B, ID: $USER_B_ID"

LOGIN_C=$(curl -s --max-time 5 -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"user_c","password":"123456"}')
echo "用户C: $LOGIN_C"
TOKEN_C=$(echo "$LOGIN_C" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
USER_C_ID=$(echo "$LOGIN_C" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f4)
echo "Token: $TOKEN_C, ID: $USER_C_ID"

echo ""
echo "=========================================="
echo "  测试完成！"
echo "=========================================="
echo ""
echo "请在浏览器中操作："
echo "1. 打开 3 个标签页访问 http://172.22.120.246:8081"
echo "2. 分别用 user_a, user_b, user_c 登录"
echo "3. user_a 创建群组：输入群组名称，点击'建群'"
echo "4. user_b 和 user_c 点击群组名称加入群聊"
echo "5. 互相发送消息测试群聊功能"
