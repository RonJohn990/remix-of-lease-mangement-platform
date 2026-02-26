"""Auth routes: /api/auth/bootstrap, /api/auth/login, /api/auth/logout, /api/auth/me"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from .app import db, Profile, UserRole

auth_bp = Blueprint('auth', __name__)


def _user_roles(user_id: str):
    rows = UserRole.query.filter_by(user_id=user_id).all()
    return [r.role for r in rows]


@auth_bp.route('/bootstrap', methods=['POST'])
def bootstrap():
    """
    POST with { check_only: true }       -> { needs_setup: bool }
    POST with { email, password, full_name } -> create first admin
    """
    body = request.get_json(silent=True) or {}

    # Check whether any admin exists
    admin_exists = UserRole.query.filter_by(role='admin').first() is not None

    if body.get('check_only'):
        return jsonify({'needs_setup': not admin_exists})

    if admin_exists:
        return jsonify({'error': 'Admin already exists. Use the login page.'}), 400

    email = (body.get('email') or '').strip()
    password = body.get('password') or ''
    full_name = (body.get('full_name') or '').strip()

    if not email or not password or not full_name:
        return jsonify({'error': 'email, password and full_name are required'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    if Profile.query.filter_by(email=email).first():
        return jsonify({'error': 'A user with this email already exists'}), 400

    import uuid
    user_id = str(uuid.uuid4())
    profile = Profile(
        user_id=user_id,
        email=email,
        full_name=full_name,
        password_hash=generate_password_hash(password),
    )
    role = UserRole(user_id=user_id, role='admin')
    db.session.add(profile)
    db.session.add(role)
    db.session.commit()

    return jsonify({'success': True})


@auth_bp.route('/login', methods=['POST'])
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get('email') or '').strip()
    password = body.get('password') or ''

    profile = Profile.query.filter_by(email=email).first()
    if not profile or not check_password_hash(profile.password_hash, password):
        return jsonify({'error': 'Invalid email or password'}), 401

    roles = _user_roles(profile.user_id)
    token = create_access_token(identity=profile.user_id)

    return jsonify({
        'token': token,
        'user': {
            'id': profile.user_id,
            'email': profile.email,
            'full_name': profile.full_name,
            'roles': roles,
        }
    })


@auth_bp.route('/logout', methods=['POST'])
def logout():
    # JWT is stateless; client drops the token
    return jsonify({'success': True})


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    profile = Profile.query.get(user_id)
    if not profile:
        return jsonify({'error': 'User not found'}), 404
    roles = _user_roles(user_id)
    return jsonify({
        'user': {
            'id': profile.user_id,
            'email': profile.email,
            'full_name': profile.full_name,
            'roles': roles,
        }
    })
