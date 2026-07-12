#!/bin/bash
mysql -u im_user -p'im_pass' im_database -e "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100) DEFAULT NULL"
mysql -u im_user -p'im_pass' im_database -e "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT NULL"
echo "列添加完成"
