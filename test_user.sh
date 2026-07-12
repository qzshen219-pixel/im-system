#!/bin/bash
mysql -u im_user -p'im_pass' im_database -e "SELECT id, username, nickname FROM users WHERE id=1"
