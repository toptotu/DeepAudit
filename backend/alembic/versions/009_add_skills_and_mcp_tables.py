"""Add skills and mcp_servers tables

Revision ID: 009_add_skills_and_mcp
Revises: 008_add_files_with_findings
Create Date: 2026-03-12 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '009_add_skills_and_mcp'
down_revision = '008_add_files_with_findings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'skills',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('version', sa.String(50), default='1.0.0'),
        sa.Column('category', sa.String(50), default='general'),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('file_path', sa.String(500), nullable=True),
        sa.Column('file_size', sa.Integer(), default=0),
        sa.Column('file_hash', sa.String(64), nullable=True),
        sa.Column('original_filename', sa.String(255), nullable=True),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('entry_point', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('is_system', sa.Boolean(), default=False),
        sa.Column('download_count', sa.Integer(), default=0),
        sa.Column('source', sa.String(50), default='local'),
        sa.Column('source_url', sa.String(500), nullable=True),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_skills_name', 'skills', ['name'])
    op.create_index('ix_skills_category', 'skills', ['category'])
    op.create_index('ix_skills_created_by', 'skills', ['created_by'])
    op.create_index('ix_skills_is_active', 'skills', ['is_active'])

    op.create_table(
        'mcp_servers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('server_type', sa.String(50), default='stdio'),
        sa.Column('command', sa.String(500), nullable=True),
        sa.Column('args', sa.JSON(), nullable=True),
        sa.Column('env', sa.JSON(), nullable=True),
        sa.Column('url', sa.String(500), nullable=True),
        sa.Column('api_key', sa.String(500), nullable=True),
        sa.Column('headers', sa.JSON(), nullable=True),
        sa.Column('tools', sa.JSON(), nullable=True),
        sa.Column('resources', sa.JSON(), nullable=True),
        sa.Column('prompts_config', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('health_status', sa.String(20), default='unknown'),
        sa.Column('last_health_check', sa.DateTime(timezone=True), nullable=True),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('timeout_seconds', sa.Integer(), default=30),
        sa.Column('max_retries', sa.Integer(), default=3),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_mcp_servers_name', 'mcp_servers', ['name'])
    op.create_index('ix_mcp_servers_server_type', 'mcp_servers', ['server_type'])
    op.create_index('ix_mcp_servers_is_active', 'mcp_servers', ['is_active'])
    op.create_index('ix_mcp_servers_created_by', 'mcp_servers', ['created_by'])


def downgrade() -> None:
    op.drop_index('ix_mcp_servers_created_by', 'mcp_servers')
    op.drop_index('ix_mcp_servers_is_active', 'mcp_servers')
    op.drop_index('ix_mcp_servers_server_type', 'mcp_servers')
    op.drop_index('ix_mcp_servers_name', 'mcp_servers')
    op.drop_table('mcp_servers')

    op.drop_index('ix_skills_is_active', 'skills')
    op.drop_index('ix_skills_created_by', 'skills')
    op.drop_index('ix_skills_category', 'skills')
    op.drop_index('ix_skills_name', 'skills')
    op.drop_table('skills')
