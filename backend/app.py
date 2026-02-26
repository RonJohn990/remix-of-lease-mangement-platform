"""
Flask backend for Lease Management Platform
SQLite + SQLAlchemy + JWT authentication
"""

import os
import uuid
import json
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (
    JWTManager, create_access_token, get_jwt_identity,
    jwt_required, verify_jwt_in_request
)
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

load_dotenv()

db = SQLAlchemy()
jwt = JWTManager()


def gen_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CorporateGroup(db.Model):
    __tablename__ = 'corporate_groups'
    corporate_id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    corporate_group_name = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.String(40), default=utcnow)

    def to_dict(self):
        return {
            'corporate_id': self.corporate_id,
            'corporate_group_name': self.corporate_group_name,
            'created_at': self.created_at,
        }


class Entity(db.Model):
    __tablename__ = 'entities'
    entity_id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    corporate_id = db.Column(db.String(36), db.ForeignKey('corporate_groups.corporate_id', ondelete='CASCADE'), nullable=False)
    legal_entity_name = db.Column(db.Text, nullable=False)
    address = db.Column(db.Text, default='')
    location = db.Column(db.Text, default='')
    pin_code = db.Column(db.Text, default='')
    financial_year_start = db.Column(db.Text, default='04-01')
    financial_year_end = db.Column(db.Text, default='03-31')
    created_at = db.Column(db.String(40), default=utcnow)

    def to_dict(self):
        return {
            'entity_id': self.entity_id,
            'corporate_id': self.corporate_id,
            'legal_entity_name': self.legal_entity_name,
            'address': self.address or '',
            'location': self.location or '',
            'pin_code': self.pin_code or '',
            'financial_year_start': self.financial_year_start or '04-01',
            'financial_year_end': self.financial_year_end or '03-31',
            'created_at': self.created_at,
        }


class Lease(db.Model):
    __tablename__ = 'leases'
    lease_id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    entity_id = db.Column(db.String(36), db.ForeignKey('entities.entity_id', ondelete='CASCADE'), nullable=False)
    legal_entity_name = db.Column(db.Text, default='')
    lease_version = db.Column(db.Integer, default=1)
    lease_event = db.Column(db.Text, default='INITIAL')
    lease_name = db.Column(db.Text, nullable=False)
    vendor_name = db.Column(db.Text, default='')
    tagged_employee = db.Column(db.Text, default='')
    asset_unit = db.Column(db.Text, default='')
    concerned_person = db.Column(db.Text, default='')
    lease_comments = db.Column(db.Text, default='')
    payment_frequency = db.Column(db.Text, default='Monthly')
    payment_timing = db.Column(db.Text, default='Arrears')
    lease_type = db.Column(db.Text, default='')
    lease_classification = db.Column(db.Text, default='Finance')
    lease_start_date = db.Column(db.Text, nullable=False)
    lease_end_date = db.Column(db.Text, nullable=False)
    rent_commencement_date = db.Column(db.Text, nullable=False)
    discount_rate_ibr = db.Column(db.Float, default=0)
    monthly_lease_amount = db.Column(db.Float, default=0)
    number_installments = db.Column(db.Integer, default=0)
    security_deposit = db.Column(db.Float, default=0)
    initial_direct_cost = db.Column(db.Float, default=0)
    short_term_flag = db.Column(db.Boolean, default=False)
    low_value_flag = db.Column(db.Boolean, default=False)
    status = db.Column(db.Text, default='Active')
    escalations = db.Column(db.Text, default='[]')
    modifications = db.Column(db.Text, default='[]')
    created_at = db.Column(db.String(40), default=utcnow)

    def to_dict(self):
        return {
            'lease_id': self.lease_id,
            'entity_id': self.entity_id,
            'legal_entity_name': self.legal_entity_name or '',
            'lease_version': self.lease_version or 1,
            'lease_event': self.lease_event or 'INITIAL',
            'lease_name': self.lease_name,
            'vendor_name': self.vendor_name or '',
            'tagged_employee': self.tagged_employee or '',
            'asset_unit': self.asset_unit or '',
            'concerned_person': self.concerned_person or '',
            'lease_comments': self.lease_comments or '',
            'payment_frequency': self.payment_frequency or 'Monthly',
            'payment_timing': self.payment_timing or 'Arrears',
            'lease_type': self.lease_type or '',
            'lease_classification': self.lease_classification or 'Finance',
            'lease_start_date': self.lease_start_date,
            'lease_end_date': self.lease_end_date,
            'rent_commencement_date': self.rent_commencement_date,
            'discount_rate_ibr': float(self.discount_rate_ibr or 0),
            'monthly_lease_amount': float(self.monthly_lease_amount or 0),
            'number_installments': self.number_installments or 0,
            'security_deposit': float(self.security_deposit or 0),
            'initial_direct_cost': float(self.initial_direct_cost or 0),
            'short_term_flag': bool(self.short_term_flag),
            'low_value_flag': bool(self.low_value_flag),
            'status': self.status or 'Active',
            'created_at': self.created_at,
            'escalations': json.loads(self.escalations or '[]'),
            'modifications': json.loads(self.modifications or '[]'),
        }


class Profile(db.Model):
    __tablename__ = 'profiles'
    user_id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    full_name = db.Column(db.Text, default='')
    email = db.Column(db.Text, nullable=False, unique=True)
    password_hash = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.String(40), default=utcnow)

    def to_dict(self):
        return {
            'user_id': self.user_id,
            'full_name': self.full_name or '',
            'email': self.email,
            'created_at': self.created_at,
        }


class UserRole(db.Model):
    __tablename__ = 'user_roles'
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String(36), nullable=False)
    role = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.String(40), default=utcnow)


class UserEntityAssignment(db.Model):
    __tablename__ = 'user_entity_assignments'
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String(36), nullable=False)
    corporate_id = db.Column(db.String(36), nullable=False)
    entity_id = db.Column(db.String(36), nullable=True)
    created_at = db.Column(db.String(40), default=utcnow)


class LeaseType(db.Model):
    __tablename__ = 'lease_types'
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    lease_type_name = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.String(40), default=utcnow)


class AssetLocation(db.Model):
    __tablename__ = 'asset_locations'
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    location_name = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.String(40), default=utcnow)


class WorkflowRole(db.Model):
    __tablename__ = 'workflow_roles'
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    role_name = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.String(40), default=utcnow)


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app():
    app = Flask(__name__)

    # Config
    db_path = os.environ.get('DATABASE_URL', 'sqlite:///lease_management.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = db_path
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'change-me-in-production')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False  # tokens don't expire by default

    db.init_app(app)
    jwt.init_app(app)

    # CORS: allow React dev server and same-origin
    allowed_origins = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:8080').split(',')
    CORS(app, resources={r"/api/*": {"origins": [o.strip() for o in allowed_origins]}},
         supports_credentials=True)

    # Register blueprints
    from .auth import auth_bp
    from .routes import data_bp, compute_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(data_bp, url_prefix='/api')
    app.register_blueprint(compute_bp, url_prefix='/api/compute')

    with app.app_context():
        db.create_all()

    return app
