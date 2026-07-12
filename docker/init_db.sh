#!/bin/bash
mysql -e "CREATE DATABASE IF NOT EXISTS im_database;"
mysql -e "CREATE USER IF NOT EXISTS 'im_user'@'localhost' IDENTIFIED BY 'im_pass';"
mysql -e "GRANT ALL ON im_database.* TO 'im_user'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

mysql -u im_user -p'im_pass' im_database << 'EOSQL'
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(64) NOT NULL,
    nickname VARCHAR(50),
    avatar_url VARCHAR(255),
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    from_user_id INT NOT NULL,
    to_user_id INT DEFAULT 0,
    group_id INT DEFAULT 0,
    content TEXT NOT NULL,
    msg_type TINYINT DEFAULT 1,
    status TINYINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_to_user (to_user_id, created_at),
    INDEX idx_from_user (from_user_id, created_at)
);

CREATE TABLE IF NOT EXISTS groups_table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owner_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    role TINYINT DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
);
EOSQL

echo "数据库初始化完成"
