FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# 使用清华镜像源
RUN sed -i 's|http://archive.ubuntu.com|http://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list && \
    sed -i 's|http://security.ubuntu.com|http://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list

# 安装依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    pkg-config \
    libboost-all-dev \
    libssl-dev \
    libmysqlclient-dev \
    libhiredis-dev \
    libjsoncpp-dev \
    libevent-dev \
    mysql-server \
    redis-server \
    wget \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 安装 WebSocket++ (如果系统没有)
RUN cd /tmp && \
    wget -q https://github.com/zaphoyd/websocketpp/archive/refs/tags/0.8.2.tar.gz -O websocketpp.tar.gz && \
    tar xzf websocketpp.tar.gz && \
    cp -r websocketpp-0.8.2/websocketpp /usr/include/ && \
    rm -rf websocketpp*

# 创建目录
RUN mkdir -p /app/src /app/include /app/web /app/build /var/log/nginx

# 复制源码
COPY include/ /app/include/
COPY src/ /app/src/
COPY CMakeLists.txt /app/

# 编译
WORKDIR /app/build
RUN cmake -DCMAKE_BUILD_TYPE=Release .. && \
    make -j$(nproc)

# 复制前端
COPY web/ /app/web/

# 创建启动脚本
RUN printf '#!/bin/bash\n\
echo "========================================="\n\
echo "  分布式即时通讯服务器"\n\
echo "========================================="\n\
\n\
# 启动 MySQL\n\
echo "[1/3] Starting MySQL..."\n\
service mysql start 2>/dev/null || mysqld_safe &\n\
sleep 3\n\
\n\
# 创建数据库\n\
echo "[2/3] Setting up database..."\n\
mysql -e "CREATE DATABASE IF NOT EXISTS im_database;" 2>/dev/null\n\
mysql -e "CREATE USER IF NOT EXISTS '\''im_user'\''@'\''localhost'\'' IDENTIFIED BY '\''im_pass'\'';" 2>/dev/null\n\
mysql -e "GRANT ALL ON im_database.* TO '\''im_user'\''@'\''localhost'\'';" 2>/dev/null\n\
mysql -e "FLUSH PRIVILEGES;" 2>/dev/null\n\
\n\
# 创建表\n\
mysql -u im_user -p'im_pass' im_database << '\''EOSQL'\''\n\
CREATE TABLE IF NOT EXISTS users (\n\
    id INT AUTO_INCREMENT PRIMARY KEY,\n\
    username VARCHAR(50) UNIQUE NOT NULL,\n\
    password_hash VARCHAR(64) NOT NULL,\n\
    nickname VARCHAR(50),\n\
    avatar_url VARCHAR(255),\n\
    status TINYINT DEFAULT 1,\n\
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n\
);\n\
\n\
CREATE TABLE IF NOT EXISTS messages (\n\
    id BIGINT AUTO_INCREMENT PRIMARY KEY,\n\
    from_user_id INT NOT NULL,\n\
    to_user_id INT DEFAULT 0,\n\
    group_id INT DEFAULT 0,\n\
    content TEXT NOT NULL,\n\
    msg_type TINYINT DEFAULT 1,\n\
    status TINYINT DEFAULT 0,\n\
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n\
    INDEX idx_to_user (to_user_id, created_at),\n\
    INDEX idx_from_user (from_user_id, created_at)\n\
);\n\
\n\
CREATE TABLE IF NOT EXISTS groups (\n\
    id INT AUTO_INCREMENT PRIMARY KEY,\n\
    name VARCHAR(100) NOT NULL,\n\
    owner_id INT NOT NULL,\n\
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n\
);\n\
\n\
CREATE TABLE IF NOT EXISTS group_members (\n\
    group_id INT NOT NULL,\n\
    user_id INT NOT NULL,\n\
    role TINYINT DEFAULT 0,\n\
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n\
    PRIMARY KEY (group_id, user_id)\n\
);\n\
EOSQL\n\
\n\
# 启动 Redis\n\
echo "[3/3] Starting Redis..."\n\
redis-server --daemonize yes\n\
\n\
echo "========================================="\n\
echo "  所有服务已启动"\n\
echo "  WebSocket: ws://localhost:8001"\n\
echo "  HTTP API: http://localhost:8080"\n\
echo "  账号: admin / 123456"\n\
echo "========================================="\n\
\n\
# 启动 IM 服务器\n\
/app/build/im-server -p 8001 --redis-host 127.0.0.1 --redis-port 6379 --mysql-host 127.0.0.1 --mysql-user im_user --mysql-pass im_pass --mysql-db im_database\n' > /start.sh && chmod +x /start.sh

EXPOSE 8001

CMD ["/start.sh"]
