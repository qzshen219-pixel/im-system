#!/bin/bash
API_URL="http://172.22.120.246:8080"

echo "=== 测试密码加盐功能 ==="

echo ""
echo "1. 注册新用户（使用加盐密码）"
curl -s --max-time 5 -X POST "$API_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"salt_test","password":"mypassword123","nickname":"盐值测试"}'
echo ""

echo "2. 登录测试"
curl -s --max-time 5 -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"salt_test","password":"mypassword123"}'
echo ""

echo "3. 错误密码测试"
curl -s --max-time 5 -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"salt_test","password":"wrongpassword"}'
echo ""

echo "=== 测试完成 ==="
