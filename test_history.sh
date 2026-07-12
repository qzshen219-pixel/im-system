#!/bin/bash
echo "=== 测试消息历史 API ==="
curl -s "http://127.0.0.1:8080/api/messages/history?user_id=1&target_id=2"
echo ""
