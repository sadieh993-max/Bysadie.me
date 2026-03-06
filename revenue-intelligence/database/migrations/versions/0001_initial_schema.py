"""Initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("session_key", sa.String(length=255), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_sessions_session_key", "sessions", ["session_key"], unique=True)
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"], unique=False)

    op.create_table(
        "affiliate_clicks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("affiliate_id", sa.String(length=128), nullable=False),
        sa.Column("source", sa.String(length=128), nullable=False),
        sa.Column("campaign", sa.String(length=128), nullable=True),
        sa.Column("clicked_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_affiliate_clicks_affiliate_id", "affiliate_clicks", ["affiliate_id"], unique=False)
    op.create_index("ix_affiliate_clicks_session_id", "affiliate_clicks", ["session_id"], unique=False)

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("order_number", sa.String(length=128), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_orders_order_number", "orders", ["order_number"], unique=True)
    op.create_index("ix_orders_user_id", "orders", ["user_id"], unique=False)

    op.create_table(
        "touchpoints",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("reference_id", sa.String(length=128), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_touchpoints_user_id", "touchpoints", ["user_id"], unique=False)

    op.create_table(
        "ltv_cohorts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_key", sa.String(length=128), nullable=False),
        sa.Column("predicted_ltv", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_ltv_cohorts_cohort_key", "ltv_cohorts", ["cohort_key"], unique=True)

    op.create_table(
        "attribution_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_attribution_results_order_id", "attribution_results", ["order_id"], unique=False)


def downgrade() -> None:
    op.drop_table("attribution_results")
    op.drop_table("ltv_cohorts")
    op.drop_table("touchpoints")
    op.drop_table("orders")
    op.drop_table("affiliate_clicks")
    op.drop_table("sessions")
    op.drop_table("users")
