#!/bin/bash
# IM 服务器守护进程
# 功能：自动重启、健康检查、日志管理

IM_SERVER="/mnt/e/distributed-cloud-disk/im-system/build/im-server"
LOG_FILE="/tmp/im-server.log"
PID_FILE="/tmp/im-server.pid"
HEALTH_URL="http://127.0.0.1:8080/api/friends?user_id=1"

# 服务器参数
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
MYSQL_HOST="127.0.0.1"
MYSQL_USER="im_user"
MYSQL_PASS="im_pass"
MYSQL_DB="im_database"
WS_PORT=8001

# 最大重启次数
MAX_RESTARTS=10
RESTART_COUNT=0
HEALTH_CHECK_INTERVAL=30

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_health() {
    curl -s --max-time 5 "$HEALTH_URL" > /dev/null 2>&1
    return $?
}

start_server() {
    log "启动 IM 服务器..."
    cd /mnt/e/distributed-cloud-disk/im-system/build
    nohup ./im-server -p $WS_PORT \
        --redis-host $REDIS_HOST \
        --redis-port $REDIS_PORT \
        --mysql-host $MYSQL_HOST \
        --mysql-user $MYSQL_USER \
        --mysql-pass $MYSQL_PASS \
        --mysql-db $MYSQL_DB \
        >> "$LOG_FILE" 2>&1 &
    
    echo $! > "$PID_FILE"
    log "服务器已启动，PID: $(cat $PID_FILE)"
}

stop_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            log "停止服务器 PID: $PID"
            kill "$PID"
            sleep 2
        fi
        rm -f "$PID_FILE"
    fi
}

# 主循环
log "========================================="
log "  IM 服务器守护进程启动"
log "========================================="

while true; do
    # 检查服务器是否运行
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ! kill -0 "$PID" 2>/dev/null; then
            log "服务器进程已停止，准备重启..."
            RESTART_COUNT=$((RESTART_COUNT + 1))
            
            if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
                log "达到最大重启次数 $MAX_RESTARTS，退出守护进程"
                exit 1
            fi
            
            log "重启次数: $RESTART_COUNT/$MAX_RESTARTS"
            start_server
            sleep 5
        fi
    else
        log "PID 文件不存在，启动服务器..."
        start_server
        sleep 5
    fi
    
    # 健康检查
    if check_health; then
        RESTART_COUNT=0  # 健康检查通过，重置重启计数
    else
        log "健康检查失败..."
        RESTART_COUNT=$((RESTART_COUNT + 1))
        
        if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
            log "达到最大重启次数，停止守护进程"
            stop_server
            exit 1
        fi
        
        log "重启服务器... ($RESTART_COUNT/$MAX_RESTARTS)"
        stop_server
        sleep 3
        start_server
        sleep 10
    fi
    
    sleep $HEALTH_CHECK_INTERVAL
done
