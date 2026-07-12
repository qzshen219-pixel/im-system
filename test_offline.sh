#!/bin/bash
API_URL="http://172.22.120.246:8080"

echo "=========================================="
echo "  离线消息功能测试"
echo "=========================================="

echo ""
echo "=== 1. 注册测试用户 ==="
curl -s --max-time 5 -X POST "$API_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"offline_user1","password":"123456","nickname":"离线用户1"}'
echo ""

curl -s --max-time 5 -X POST "$API_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"offline_user2","password":"123456","nickname":"离线用户2"}'
echo ""

echo ""
echo "=== 2. 登录用户1 ==="
LOGIN1=$(curl -s --max-time 5 -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"offline_user1","password":"123456"}')
echo "用户1: $LOGIN1"
USER1_ID=$(echo "$LOGIN1" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "用户1 ID: $USER1_ID"

echo ""
echo "=== 3. 用户2不在线，用户1发送消息 ==="
echo "（用户2未登录，消息应该被存储为离线消息）"

echo ""
echo "=== 4. 检查Redis离线消息队列 ==="
wsl -d Ubuntu -- bash -c "redis-cli LLEN offline:$USER1_ID 2>/dev/null || echo 'Redis命令执行失败'"
echo ""

echo ""
echo "=========================================="
echo "  离线消息测试准备完成！"
echo "=========================================="
echo ""
echo "测试步骤："
echo "1. 打开浏览器访问 http://172.22.120.246:8081"
echo "2. 用 offline_user1 登录"
echo "3. 在右侧联系人面板点击 offline_user2"
echo "4. 发送几条消息（此时 offline_user2 不在线）"
echo "5. 打开新标签页，用 offline_user2 登录"
echo "6. offline_user2 应该能看到离线消息"
echo ""
echo "离线消息存储在 Redis 中："
echo "  - 键名: offline:<用户ID>"
echo "  - 类型: List"
wsl -d Ubuntu -- bash -c "redis-cli KEYS 'offline:*' 2>/dev/null"
