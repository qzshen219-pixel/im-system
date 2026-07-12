#!/bin/bash
mysql -u im_user -p'im_pass' im_database -e "SELECT id, username, nickname, email, phone, created_at FROM users WHERE id=1"
