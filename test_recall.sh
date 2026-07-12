#!/bin/bash
echo "=== 测试消息撤回 ==="
curl -s -X POST "http://127.0.0.1:8080/api/message/recall" \
  -H "Content-Type: application/json" \
  -d '{"message_id":30,"user_id":2}'
echo ""

echo "=== 检查消息状态 ==="
mysql -u im_user -p'im_pass' im_database -e "SELECT id, content FROM messages WHERE id=30"
