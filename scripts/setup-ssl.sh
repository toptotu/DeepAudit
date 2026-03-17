#!/usr/bin/env bash
# =============================================
# DeepAudit SSL 证书申请脚本
# 使用 Let's Encrypt (Certbot) 申请免费 HTTPS 证书
#
# 使用前提:
#   1. 域名已解析到本服务器 IP
#   2. 服务器 80 端口可公网访问
#   3. 已安装 Docker
#
# 使用方法:
#   bash scripts/setup-ssl.sh <your-domain.com> <your-email>
#
# 示例:
#   bash scripts/setup-ssl.sh deepaudit.example.com admin@example.com
# =============================================

set -euo pipefail

# ─── 参数检查 ─────────────────────────────────
DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
    echo "用法: $0 <域名> <邮箱>"
    echo "示例: $0 deepaudit.example.com admin@example.com"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="$PROJECT_DIR/certs"

echo "================================================"
echo "  DeepAudit SSL 证书申请"
echo "  域名: $DOMAIN"
echo "  邮箱: $EMAIL"
echo "  证书目录: $CERTS_DIR"
echo "================================================"

# ─── 前提检查 ─────────────────────────────────
check_requirements() {
    if ! command -v docker &>/dev/null; then
        echo "[错误] 未找到 Docker，请先安装 Docker"
        exit 1
    fi

    # 检查 80 端口是否被占用
    if ss -tlnp | grep -q ':80 ' 2>/dev/null; then
        echo "[警告] 80 端口已被占用，Certbot 需要临时使用 80 端口"
        echo "请先停止占用 80 端口的服务后重试"
        echo "已占用 80 端口的进程:"
        ss -tlnp | grep ':80 '
        read -rp "是否继续（可能失败）? [y/N] " confirm
        [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
    fi
}

# ─── DNS 解析验证 ──────────────────────────────
check_dns() {
    echo ""
    echo "[检查] 验证 DNS 解析..."
    SERVER_IP=$(curl -s --max-time 5 ifconfig.me || curl -s --max-time 5 api.ipify.org || echo "unknown")
    DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1 || nslookup "$DOMAIN" 2>/dev/null | awk '/^Address: /{print $2}' | tail -1 || echo "unknown")

    echo "  服务器公网 IP: $SERVER_IP"
    echo "  域名解析 IP:   $DOMAIN_IP"

    if [[ "$SERVER_IP" != "unknown" && "$DOMAIN_IP" != "unknown" && "$SERVER_IP" != "$DOMAIN_IP" ]]; then
        echo ""
        echo "[警告] 域名 $DOMAIN 解析的 IP ($DOMAIN_IP) 与服务器公网 IP ($SERVER_IP) 不一致"
        echo "请确认域名已正确解析到本服务器，否则证书申请会失败"
        read -rp "是否继续? [y/N] " confirm
        [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
    else
        echo "  [OK] DNS 解析正常"
    fi
}

# ─── 申请证书 ─────────────────────────────────
request_certificate() {
    echo ""
    echo "[申请] 使用 Certbot 申请 Let's Encrypt 证书..."
    mkdir -p "$CERTS_DIR"

    docker run --rm \
        -p 80:80 \
        -v "$CERTS_DIR:/etc/letsencrypt" \
        certbot/certbot certonly \
            --standalone \
            --non-interactive \
            --agree-tos \
            --email "$EMAIL" \
            --domain "$DOMAIN" \
            --preferred-challenges http

    echo ""
    echo "[成功] 证书已申请成功！"
    echo "  证书路径: $CERTS_DIR/live/$DOMAIN/fullchain.pem"
    echo "  私钥路径: $CERTS_DIR/live/$DOMAIN/privkey.pem"
}

# ─── 生成 nginx HTTPS 配置 ────────────────────
generate_nginx_config() {
    echo ""
    echo "[配置] 生成 Nginx HTTPS 配置..."

    # 将 nginx.https.conf 中的 ${DOMAIN} 替换为实际域名
    sed "s/\${DOMAIN}/$DOMAIN/g" "$PROJECT_DIR/frontend/nginx.https.conf" \
        > "$PROJECT_DIR/frontend/nginx.https.generated.conf"

    echo "  [OK] Nginx 配置已生成: frontend/nginx.https.generated.conf"
}

# ─── 设置自动续签 ──────────────────────────────
setup_auto_renew() {
    echo ""
    echo "[续签] 配置证书自动续签..."

    RENEW_SCRIPT="$PROJECT_DIR/scripts/renew-ssl.sh"
    cat > "$RENEW_SCRIPT" << EOF
#!/usr/bin/env bash
# 自动续签 DeepAudit SSL 证书
# 每天凌晨 2 点检查是否需要续签（Let's Encrypt 会在到期前 30 天自动续签）
CERTS_DIR="$CERTS_DIR"
DOMAIN="$DOMAIN"

docker run --rm \\
    -p 80:80 \\
    -v "\$CERTS_DIR:/etc/letsencrypt" \\
    certbot/certbot renew \\
    --standalone \\
    --non-interactive \\
    --quiet

# 续签后重载 Nginx
docker exec deepaudit-frontend-1 nginx -s reload 2>/dev/null || true
echo "[\$(date)] 证书续签检查完成" >> /var/log/deepaudit-ssl-renew.log
EOF
    chmod +x "$RENEW_SCRIPT"

    # 添加 crontab（每天 2:30 检查）
    CRON_JOB="30 2 * * * bash $RENEW_SCRIPT"
    if ! crontab -l 2>/dev/null | grep -qF "$RENEW_SCRIPT"; then
        (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
        echo "  [OK] 已添加 crontab 自动续签任务: 每天 02:30 检查"
    else
        echo "  [跳过] crontab 已存在续签任务"
    fi
}

# ─── 打印下一步操作 ───────────────────────────
print_next_steps() {
    echo ""
    echo "================================================"
    echo "  证书申请完成！接下来："
    echo "================================================"
    echo ""
    echo "1. 更新 docker-compose.external.yml 中的 frontend volumes："
    echo "   将注释的 HTTPS 配置行取消注释："
    echo ""
    echo "   volumes:"
    echo "     # 注释掉 HTTP 配置"
    echo "     # - ./frontend/nginx.external.conf:/etc/nginx/conf.d/default.conf:ro"
    echo "     # 取消注释 HTTPS 配置"
    echo "     - ./frontend/nginx.https.generated.conf:/etc/nginx/conf.d/default.conf:ro"
    echo "     - ./certs:/etc/nginx/certs:ro"
    echo ""
    echo "2. 重启服务："
    echo "   docker compose -f docker-compose.external.yml up -d frontend"
    echo ""
    echo "3. 验证 HTTPS 访问："
    echo "   https://$DOMAIN"
    echo ""
    echo "证书有效期: 90 天（已配置自动续签）"
    echo "================================================"
}

# ─── 主流程 ───────────────────────────────────
main() {
    check_requirements
    check_dns
    request_certificate
    generate_nginx_config
    setup_auto_renew
    print_next_steps
}

main
