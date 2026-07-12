#!/bin/bash
API_URL="http://172.22.120.246:8080"

echo "=========================================="
echo "  文件上传下载功能测试"
echo "=========================================="

# 创建测试文件
echo "Hello, this is a test file for IM system!" > /tmp/test_file.txt

echo ""
echo "=== 1. 登录用户 ==="
LOGIN=$(curl -s --max-time 5 -X POST "$API_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"123456"}')
echo "$LOGIN"
USER_ID=$(echo "$LOGIN" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "用户ID: $USER_ID"

echo ""
echo "=== 2. 测试文件上传 ==="
# 将文件转为 base64
FILE_DATA=$(base64 -w 0 /tmp/test_file.txt)
echo "文件大小: $(wc -c < /tmp/test_file.txt) bytes"
echo "Base64 长度: ${#FILE_DATA}"

# 上传文件
UPLOAD_RESULT=$(curl -s --max-time 10 -X POST "$API_URL/api/upload" \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"test_file.txt\",\"file_data\":\"$FILE_DATA\",\"from_user_id\":$USER_ID,\"to_user_id\":2}")
echo "上传结果: $UPLOAD_RESULT"

FILE_ID=$(echo "$UPLOAD_RESULT" | grep -o '"file_id":[0-9]*' | cut -d: -f2)
echo "文件ID: $FILE_ID"

echo ""
echo "=== 3. 测试文件下载 ==="
if [ -n "$FILE_ID" ]; then
    DOWNLOAD_RESULT=$(curl -s --max-time 5 "$API_URL/api/download?file_id=$FILE_ID")
    echo "下载结果: $DOWNLOAD_RESULT" | head -c 200
    echo "..."
    
    # 提取文件数据并解码
    echo "$DOWNLOAD_RESULT" | grep -o '"file_data":"[^"]*"' | cut -d'"' -f4 | base64 -d > /tmp/downloaded_file.txt
    echo "下载文件内容:"
    cat /tmp/downloaded_file.txt
else
    echo "文件上传失败，无法测试下载"
fi

echo ""
echo "=== 4. 测试无效文件ID ==="
curl -s --max-time 5 "$API_URL/api/download?file_id=99999"
echo ""

echo ""
echo "=========================================="
echo "  文件上传下载测试完成！"
echo "=========================================="
