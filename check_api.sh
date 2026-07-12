#!/bin/bash
echo "=== 检查 API 服务器 ==="
curl -s http://127.0.0.1:8080/api/login -X POST -H "Content-Type: application/json" -d '{"username":"test1","password":"123456"}'
echo ""

echo "=== 检查端口 ==="
ss -tlnp | grep 8080
