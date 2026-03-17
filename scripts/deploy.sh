#!/usr/bin/env bash
# =============================================
# DeepAudit 外网部署一键脚本
# =============================================
# 使用方法:
#   bash scripts/deploy.sh              # 交互式部署
#   bash scripts/deploy.sh --http-only  # 仅 HTTP 模式
#   bash scripts/deploy.sh --update     # 更新到最新版本
#
# 前提条件:
#   - Docker >= 24 和 Docker Compose v2
#   - 服务器 80/443 端口已在防火墙/安全组放行
# =============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.external.yml"
ENV_FILE="$PROJECT_DIR/.env.prod"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()    { echo -e "\n${BLUE}━━━ $* ━━━${NC}"; }

# ─── 解析参数 ─────────────────────────────────
HTTP_ONLY=false
UPDATE_MODE=false
for arg in "$@"; do
    case $arg in
        --http-only) HTTP_ONLY=true ;;
        --update)    UPDATE_MODE=true ;;
    esac
done

# ─── 前提检查 ─────────────────────────────────
check_prerequisites() {
    log_step "检查前提条件"

    if ! command -v docker &>/dev/null; then
        log_error "未找到 Docker，请先安装: https://docs.docker.com/engine/install/"
        exit 1
    fi

    if ! docker compose version &>/dev/null 2>&1; then
        log_error "未找到 Docker Compose v2，请升级 Docker"
        exit 1
    fi

    DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
    log_info "Docker: $DOCKER_VERSION | Compose: $COMPOSE_VERSION"
    log_info "前提条件检查通过"
}

# ─── 初始化环境配置 ───────────────────────────
setup_env() {
    log_step "配置环境变量"

    if [[ -f "$ENV_FILE" ]]; then
        log_info "发现已有 .env.prod 文件，跳过初始化"
        # 检查是否有未修改的 CHANGE_ME 项
        if grep -q "CHANGE_ME" "$ENV_FILE" 2>/dev/null; then
            log_warn ".env.prod 中存在未修改的占位符，请检查以下项："
            grep "CHANGE_ME" "$ENV_FILE" | sed 's/=.*/=<需要修改>/'
            read -rp "是否继续部署（可能导致安全风险）? [y/N] " confirm
            [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
        fi
        return
    fi

    log_info "未找到 .env.prod，开始交互式配置..."
    cp "$PROJECT_DIR/.env.prod.example" "$ENV_FILE"

    # 交互式填写配置
    echo ""
    read -rp "  LLM API Key (如 sk-xxx): " LLM_API_KEY
    read -rp "  LLM 模型 (默认 gpt-4o): " LLM_MODEL
    LLM_MODEL="${LLM_MODEL:-gpt-4o}"
    read -rp "  LLM Base URL (留空使用官方地址): " LLM_BASE_URL

    # 生成随机密码
    DB_PASSWORD=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 24)
    REDIS_PASSWORD=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 24)
    SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '/+=' | head -c 48)

    # 写入配置
    sed -i "s/CHANGE_ME_db_password/$DB_PASSWORD/g" "$ENV_FILE"
    sed -i "s/CHANGE_ME_redis_password/$REDIS_PASSWORD/g" "$ENV_FILE"
    sed -i "s/CHANGE_ME_jwt_secret_key_min_32_chars/$SECRET_KEY/g" "$ENV_FILE"
    sed -i "s|LLM_API_KEY=sk-your-api-key-here|LLM_API_KEY=$LLM_API_KEY|" "$ENV_FILE"
    sed -i "s/LLM_MODEL=gpt-4o/LLM_MODEL=$LLM_MODEL/" "$ENV_FILE"
    [[ -n "$LLM_BASE_URL" ]] && sed -i "s|LLM_BASE_URL=|LLM_BASE_URL=$LLM_BASE_URL|" "$ENV_FILE"

    log_info ".env.prod 已创建"
    log_warn "请妥善保管 .env.prod 文件，包含数据库密码等敏感信息"
}

# ─── 防火墙配置 ───────────────────────────────
configure_firewall() {
    log_step "检查防火墙配置"

    if command -v ufw &>/dev/null; then
        UFW_STATUS=$(ufw status | head -1)
        log_info "UFW 状态: $UFW_STATUS"
        if echo "$UFW_STATUS" | grep -q "active"; then
            log_info "开放 80 和 443 端口..."
            ufw allow 80/tcp  &>/dev/null || true
            ufw allow 443/tcp &>/dev/null || true
            log_info "防火墙端口已开放"
        fi
    elif command -v firewall-cmd &>/dev/null; then
        log_info "开放 80 和 443 端口 (firewalld)..."
        firewall-cmd --permanent --add-port=80/tcp  &>/dev/null || true
        firewall-cmd --permanent --add-port=443/tcp &>/dev/null || true
        firewall-cmd --reload &>/dev/null || true
        log_info "防火墙端口已开放"
    else
        log_warn "未检测到 ufw/firewalld，请手动确认 80/443 端口已开放"
        log_warn "云服务器还需在安全组中开放 80/443 端口"
    fi
}

# ─── 拉取镜像 ─────────────────────────────────
pull_images() {
    log_step "拉取 Docker 镜像"
    log_info "正在拉取最新镜像（可能需要几分钟）..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull --quiet
    log_info "镜像拉取完成"
}

# ─── 启动服务 ─────────────────────────────────
start_services() {
    log_step "启动 DeepAudit 服务"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans
    log_info "等待服务就绪..."
    sleep 5

    # 检查服务状态
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
}

# ─── 健康检查 ─────────────────────────────────
health_check() {
    log_step "健康检查"

    MAX_WAIT=60
    WAITED=0
    log_info "等待后端 API 就绪..."

    while [[ $WAITED -lt $MAX_WAIT ]]; do
        if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
            exec -T backend curl -sf http://localhost:8000/api/v1/health &>/dev/null 2>&1; then
            log_info "后端 API 就绪"
            break
        fi
        sleep 2
        WAITED=$((WAITED + 2))
    done

    if [[ $WAITED -ge $MAX_WAIT ]]; then
        log_warn "后端健康检查超时，请查看日志: docker compose -f docker-compose.external.yml logs backend"
    fi

    # 获取公网 IP
    PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 api.ipify.org 2>/dev/null || echo "未知")
    log_info "服务器公网 IP: $PUBLIC_IP"
}

# ─── 打印访问信息 ──────────────────────────────
print_access_info() {
    log_step "部署完成"

    # 从 .env.prod 读取域名
    DOMAIN=""
    if [[ -f "$ENV_FILE" ]]; then
        DOMAIN=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d= -f2 | tr -d ' ' 2>/dev/null || true)
    fi
    PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "你的服务器IP")

    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}  DeepAudit 外网部署成功！${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo "  访问地址（HTTP）:"
    echo -e "    ${BLUE}http://$PUBLIC_IP${NC}"
    if [[ -n "$DOMAIN" && "$DOMAIN" != "deepaudit.example.com" ]]; then
        echo -e "    ${BLUE}http://$DOMAIN${NC}"
    fi
    echo ""
    echo "  开启 HTTPS（推荐）:"
    echo "    bash scripts/setup-ssl.sh $DOMAIN your@email.com"
    echo ""
    echo "  常用命令:"
    echo "    查看日志:   docker compose -f docker-compose.external.yml logs -f"
    echo "    重启服务:   docker compose -f docker-compose.external.yml restart"
    echo "    停止服务:   docker compose -f docker-compose.external.yml down"
    echo "    更新版本:   bash scripts/deploy.sh --update"
    echo ""
    echo "  ⚠️  安全提醒:"
    echo "    1. 请修改 .env.prod 中的默认密码"
    echo "    2. 强烈建议配置 HTTPS"
    echo "    3. 确认服务器安全组/防火墙已开放 80/443 端口"
    echo ""
    echo -e "${GREEN}================================================${NC}"
}

# ─── 更新模式 ─────────────────────────────────
update_services() {
    log_step "更新 DeepAudit 到最新版本"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans
    log_info "更新完成"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
}

# ─── 主流程 ───────────────────────────────────
main() {
    echo -e "${BLUE}"
    echo "  ██████╗ ███████╗███████╗██████╗  █████╗ ██╗   ██╗██████╗ ██╗████████╗"
    echo "  ██╔══██╗██╔════╝██╔════╝██╔══██╗██╔══██╗██║   ██║██╔══██╗██║╚══██╔══╝"
    echo "  ██║  ██║█████╗  █████╗  ██████╔╝███████║██║   ██║██║  ██║██║   ██║   "
    echo "  ██║  ██║██╔══╝  ██╔══╝  ██╔═══╝ ██╔══██║██║   ██║██║  ██║██║   ██║   "
    echo "  ██████╔╝███████╗███████╗██║     ██║  ██║╚██████╔╝██████╔╝██║   ██║   "
    echo "  ╚═════╝ ╚══════╝╚══════╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝   ╚═╝   "
    echo -e "${NC}"

    if $UPDATE_MODE; then
        [[ ! -f "$ENV_FILE" ]] && { log_error "未找到 .env.prod，请先完整部署"; exit 1; }
        update_services
        exit 0
    fi

    check_prerequisites
    setup_env
    configure_firewall
    pull_images
    start_services
    health_check
    print_access_info
}

main
