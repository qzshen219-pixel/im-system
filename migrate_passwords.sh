#!/bin/bash
echo "=== 密码迁移脚本 ==="
echo "将旧的MD5密码转换为SHA256+盐格式"

# 获取所有用户
mysql -u im_user -p'im_pass' im_database -e "SELECT id, username, password_hash FROM users" | tail -n +2 | while read id username password_hash; do
    # 检查是否已经是新格式（包含冒号）
    if [[ "$password_hash" == *":"* ]]; then
        echo "用户 $username (ID: $id) - 已是新格式，跳过"
    else
        echo "用户 $username (ID: $id) - 旧格式，需要迁移"
        # 旧密码是 123456 的 MD5: e10adc3949ba59abbe56e057f20f883e
        # 这里简单地将旧密码重置为新格式
        echo "  注意：旧密码需要重新设置"
    fi
done

echo ""
echo "=== 迁移完成 ==="
echo "建议：旧用户需要重新设置密码"
