#!/bin/bash
mysql -u im_user -p'im_pass' im_database << 'EOSQL'
CREATE TABLE IF NOT EXISTS files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_data LONGTEXT,
    from_user_id INT NOT NULL,
    to_user_id INT DEFAULT 0,
    group_id INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
EOSQL

echo "files 表创建完成"
